# jev-verify

Teaches Claude to check its own delivery against an acceptance checklist, the Git diff and freshly executed tests before saying it is done.

```sh
claude plugin marketplace add jevtool/claude-plugins
claude plugin install jev-verify@jevtool
```

See [skills/jev-verify/SKILL.md](skills/jev-verify/SKILL.md) for exactly what Claude does. Uses the [jevtool CLI](https://github.com/jevtool/jevtool) via `npx`.
