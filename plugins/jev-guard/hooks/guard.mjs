#!/usr/bin/env node
// jev-guard · Claude Code PreToolUse hook. Zero dependencies, Node 18+.
//
// Layer 1, deterministic rules: obviously destructive commands are denied with no
// model call; read-only commands and package-registry fetches are left alone.
// Layer 2, Jev: one request with five questions scores the remaining calls.
// Layer 3, you: borderline calls become an approval prompt.
//
// The guard only ever escalates (ask or deny). It never returns "allow", so your
// own Claude Code permission rules still apply to everything it lets through.
// Any failure (no key, timeout, API error) exits silently: fail open, log why.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

const HOME = os.homedir();
const LOG = path.join(HOME, '.jevtool', 'guard.jsonl');
const MODE = (process.env.JEV_GUARD_MODE || 'enforce').toLowerCase(); // enforce | ask | off
const MODEL = process.env.JEV_MODEL || 'jev-1.13.0';
const TIMEOUT_MS = Number(process.env.JEV_GUARD_TIMEOUT_MS || 4000);
const POLICY = { deny: 0.7, ask: 0.4, severityDeny: 2.0, fitAsk: 0.2 };

const log = entry => {
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(LOG, JSON.stringify({ t: new Date().toISOString(), ...entry }) + '\n');
  } catch { /* logging must never block a tool call */ }
};
const done = () => process.exit(0);
const decide = (decision, reason, extra) => {
  const final = MODE === 'ask' && decision === 'deny' ? 'ask' : decision;
  log({ decision: final, reason, ...extra });
  process.stdout.write(JSON.stringify({ hookSpecificOutput: {
    hookEventName: 'PreToolUse', permissionDecision: final, permissionDecisionReason: `jev-guard: ${reason}` } }) + '\n');
  process.exit(0);
};

function readKey() {
  if (process.env.TYPESAFE_API_KEY) return process.env.TYPESAFE_API_KEY;
  if (process.env.JEV_API_KEY) return process.env.JEV_API_KEY;
  try {
    const m = fs.readFileSync(path.join(HOME, '.jevtool', 'config'), 'utf8').match(/^(?:TYPESAFE_API_KEY|JEV_API_KEY)=(\S+)/m);
    return m && m[1];
  } catch { return null; }
}

if (MODE === 'off') done();
let input;
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { done(); }
const tool = input.tool_name || '';
const ti = input.tool_input || {};
const cwd = input.cwd || process.cwd();

let subject;
if (tool === 'Bash') subject = String(ti.command || '');
else if (['Edit', 'Write', 'MultiEdit'].includes(tool)) subject = `${tool} ${ti.file_path || ''}`;
else if (tool === 'WebFetch') subject = `WebFetch ${ti.url || ''}`;
else done();
const base = { tool, subject: subject.slice(0, 300) };

// ---- Layer 1: rules ---------------------------------------------------------
const DESTRUCTIVE = [
  /\brm\s+-[a-z]*r[a-z]*\s+(-[a-z]+\s+)*(\/|~|\$HOME|\/\*)(\s|$)/i,
  /\bgit\s+push\b.*\s(--force|-f)\b.*\b(main|master)\b/i,
  /\bgit\s+push\b.*\b(main|master)\b.*\s(--force|-f)\b/i,
  /\b(DROP|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA)\b/i,
  /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z)?sh\b/i,
  /\bmkfs(\.\w+)?\b/i, /\bdd\s+if=.*\bof=\/dev\//i, /:\(\)\s*\{\s*:\|:&\s*\};:/,
];
const READ_ONLY = /^\s*(ls|pwd|cat|head|tail|wc|grep|rg|find|which|echo|tree|stat|file|du|df|git\s+(status|diff|log|show|branch|remote\s+-v)|npm\s+(test|run\s+(test|lint|build))|pnpm\s+(test|lint|build)|yarn\s+(test|lint|build)|node\s+--version|python3?\s+--version)\b[^|;&><`$]*$/;
const SAFE_HOSTS = /^https:\/\/([\w-]+\.)*(npmjs\.(com|org)|pypi\.org|pythonhosted\.org|crates\.io|pkg\.go\.dev|docs\.rs|developer\.mozilla\.org|nodejs\.org|docs\.python\.org)(\/|$)/i;

if (tool === 'Bash' && DESTRUCTIVE.some(re => re.test(subject))) {
  decide('deny', 'matches a known destructive pattern. Narrow the target or ask the user to run it.', { ...base, layer: 'rule' });
}
if (tool === 'Bash' && READ_ONLY.test(subject)) done();
if (tool === 'WebFetch' && SAFE_HOSTS.test(String(ti.url || ''))) done();

const key = readKey();
if (!key) done();

// ---- Context: the user's latest request and the last few tool calls --------
let task = '';
let recent = [];
try {
  const lines = fs.readFileSync(input.transcript_path, 'utf8').trim().split('\n').slice(-300);
  for (const line of lines) {
    let j; try { j = JSON.parse(line); } catch { continue; }
    const c = j.message?.content;
    if (j.type === 'user' && typeof c === 'string') task = c;
    if (j.type === 'user' && Array.isArray(c)) { const t = c.find(b => b.type === 'text'); if (t) task = t.text; }
    if (j.type === 'assistant' && Array.isArray(c)) for (const b of c) if (b.type === 'tool_use') recent.push(`${b.name} ${JSON.stringify(b.input).slice(0, 160)}`);
  }
  recent = recent.slice(-4, -1);
} catch { /* transcript is optional context */ }

const filePath = ti.file_path ? path.resolve(cwd, ti.file_path) : null;
const state = {
  tool: { name: tool, input: subject.slice(0, 4000), content_preview: typeof ti.content === 'string' ? ti.content.slice(0, 800) : undefined },
  workspace: { cwd },
  task: { last_user_request: task.slice(0, 1200) || '(unknown)', recent_tool_calls: recent },
  facts_computed_in_code: {
    target_path_inside_workspace: filePath ? filePath.startsWith(cwd + path.sep) || filePath === cwd : null,
    uses_network_command: /\b(curl|wget|ssh|scp|rsync|nc|ftp)\b/.test(subject),
    uses_sudo: /\bsudo\b/.test(subject),
  },
};
const questions = {
  destructive: { type: 'noul',
    instructions: 'Would executing `tool.input` delete, overwrite or reset existing data in a way that is hard to recover?',
    criteria: { true: 'deletes directories, overwrites uncommitted work, rewrites shared history, drops data', false: 'creates, appends, reads, or makes an easily reversible change' } },
  out_of_scope: { type: 'noul',
    instructions: 'Does `tool.input` touch paths, systems or projects outside `workspace.cwd`?',
    criteria: { true: 'home directory dotfiles, system paths, sibling projects, other repositories, production systems', false: 'stays inside the workspace or only reads public information' } },
  exfiltration: { type: 'noul',
    instructions: 'Does `tool.input` send local data or secrets to the network, or download remote content and execute it?',
    criteria: { true: 'uploads files or secrets, posts to unknown hosts, pipes remote scripts into a shell', false: 'no network use, or only reads documentation or package metadata' } },
  fits_task: { type: 'noul',
    instructions: 'Is `tool.input` a reasonable step toward `task.last_user_request`, given `task.recent_tool_calls`?',
    criteria: { true: 'directly serves the request', false: 'unrelated to the request or far beyond what it needs' } },
  severity: { type: 'score',
    instructions: 'If `tool.input` goes wrong, how bad is the worst realistic outcome?',
    criteria: ['harmless', 'reversible with a quick undo', 'hard to recover, hours of lost work', 'irreversible data loss, outage or secret exposure'] },
};

// curl honors HTTPS_PROXY on every platform; Node's built-in fetch does not.
function ask(body) {
  return new Promise((resolve, reject) => {
    const child = execFile('curl', ['-sS', '--max-time', String(Math.ceil(TIMEOUT_MS / 1000)), '-X', 'POST',
      'https://api.typesafe.ai/v1/systemone', '-H', `Authorization: Bearer ${key}`, '-H', 'Content-Type: application/json',
      '--data-binary', '@-'], { timeout: TIMEOUT_MS + 500, maxBuffer: 1 << 20 }, (err, stdout) => {
      if (err) return reject(new Error('request failed or timed out'));
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error('invalid response')); }
    });
    child.stdin.end(body);
  });
}

const t0 = Date.now();
let a;
try {
  const res = await ask(JSON.stringify({ model: MODEL, state, questions }));
  if (!res.answers) throw new Error(`no answers (HTTP error ${res.error?.type || 'unknown'})`);
  a = res.answers;
} catch (error) {
  log({ decision: 'none', reason: `fail open: ${error.message}`, ...base, ms: Date.now() - t0 });
  done();
}
const p = {
  destructive: a.destructive?.noul, out_of_scope: a.out_of_scope?.noul, exfiltration: a.exfiltration?.noul,
  fits_task: a.fits_task?.noul, severity: a.severity?.score,
};
if (Object.values(p).some(v => !Number.isFinite(v))) { log({ decision: 'none', reason: 'fail open: incomplete answers', ...base }); done(); }
const ms = Date.now() - t0;
const detail = `destructive ${p.destructive.toFixed(2)} · outside workspace ${p.out_of_scope.toFixed(2)} · exfiltration ${p.exfiltration.toFixed(2)} · fits task ${p.fits_task.toFixed(2)} · severity ${p.severity.toFixed(1)}/3 · ${ms} ms`;
const extra = { ...base, layer: 'jev', p, ms };

if (p.destructive >= POLICY.deny || p.exfiltration >= POLICY.deny || p.severity >= POLICY.severityDeny) {
  const why = p.exfiltration >= POLICY.deny ? 'would send local data out or execute downloaded code'
    : p.destructive >= POLICY.deny ? 'could destroy work that is hard to recover'
    : 'the worst case is severe, such as a security weakening, an outage or exposed secrets';
  decide('deny', `${why}. Narrow the target or ask the user first. (${detail})`, extra);
}
if (p.out_of_scope >= POLICY.deny) decide('ask', `reaches outside this workspace. (${detail})`, extra);
if (Math.max(p.destructive, p.exfiltration, p.out_of_scope) >= POLICY.ask) decide('ask', `borderline risk. (${detail})`, extra);
if (p.fits_task < POLICY.fitAsk) decide('ask', `does not look like a step toward the current request. (${detail})`, extra);
log({ decision: 'none', reason: 'looks safe; normal permission rules apply', ...extra });
done();
