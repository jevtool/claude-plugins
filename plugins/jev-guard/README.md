# jev-guard

A seatbelt for Claude Code. Before Claude runs a shell command, writes or edits a file, or fetches a URL, jev-guard decides whether you should look first.

```sh
claude plugin marketplace add jevtool/claude-plugins
claude plugin install jev-guard@jevtool
export TYPESAFE_API_KEY=...   # or TYPESAFE_API_KEY=... in ~/.jevtool/config
```

## How it decides

1. **Rules, no model call.** Known destructive patterns (`rm -rf ~`, force-push to main, `DROP TABLE`, `curl … | sh`, `mkfs`) are denied. Read-only commands (`ls`, `git status`, `npm test` …) and package-registry or docs fetches are left alone.
2. **Jev, one request, five questions.** Destructive? Outside the workspace? Exfiltration? Does it fit the current request? How bad is the worst case (0–3)? About 0.3–0.9 s and a few thousandths of a cent per check.
3. **You.** Borderline calls become Claude Code's normal approval prompt, with the probabilities in the reason.

| Condition | Result |
| --- | --- |
| destructive ≥ 0.7, exfiltration ≥ 0.7, or severity ≥ 2 | deny, the reason goes back to Claude |
| outside workspace ≥ 0.7, any hazard ≥ 0.4, or fits task < 0.2 | ask you |
| anything else | no decision; your own permission rules apply |

jev-guard never returns "allow", so it cannot loosen your existing permission settings. If there is no key, the request times out or the API errors, it exits silently (fail open) and logs why.

## Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `JEV_GUARD_MODE` | `enforce` | `ask` turns every deny into an approval prompt; `off` disables the guard |
| `JEV_MODEL` | `jev-1.13.0` | Jev model or version to call |
| `JEV_GUARD_TIMEOUT_MS` | `4000` | Request timeout before failing open |

Every decision is appended to `~/.jevtool/guard.jsonl` (tool, truncated command, probabilities, latency). The API key is never logged.

## What is sent

The tool name, the command or file path (first 4000 characters), up to 800 characters of new file content, the working directory, your latest request (first 1200 characters) and the names of the last few tool calls go to TypeSafe. Do not use it on content you cannot send to a third-party API.

## Limits

The thresholds come from a small hand-labeled set, not a benchmark. Jev reads text literally and can be steered by adversarial content inside commands or files, which is why the rule layer and your normal permissions stay in place. Treat it as a second pair of eyes, not a sandbox.
