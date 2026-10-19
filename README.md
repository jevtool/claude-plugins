# jevtool plugins for Claude Code

Claude Code plugins built on [Jev](https://docs.typesafe.ai), TypeSafe's System One model: fast, cheap, calibrated yes/no, choice and score judgments.

```sh
claude plugin marketplace add jevtool/claude-plugins
claude plugin install jev-guard@jevtool
claude plugin install jev-eval@jevtool
claude plugin install jev-verify@jevtool
```

| Plugin | What it does | Needs a TypeSafe key |
| --- | --- | --- |
| [jev-guard](plugins/jev-guard) | Scores every shell command, file write and URL fetch before it runs. Blocks destructive or exfiltrating calls, asks you about out-of-scope ones. Never auto-approves. | Yes, otherwise it stays out of the way |
| [jev-eval](plugins/jev-eval) | Skill: turns your data into a labeled test suite and runs `jevtool eval` to measure accuracy, misses and a safe confidence cutoff before you ship a Jev judgment. | Yes |
| [jev-verify](plugins/jev-verify) | Skill: checks a finished task against an acceptance checklist, the Git diff and freshly run tests before Claude says it is done. | Only for `--judge` |

Set the key once: `export TYPESAFE_API_KEY=...` (create one at [console.typesafe.ai](https://console.typesafe.ai)), or put `TYPESAFE_API_KEY=...` in `~/.jevtool/config` for jev-guard.

The skills call the [jevtool CLI](https://github.com/jevtool/jevtool) through `npx`. Node.js 20+ required.

MIT. jevtool is an independent project and is not affiliated with TypeSafe AI.
