# jev-eval

Teaches Claude to turn your data into a labeled Jev test suite and run jevtool eval: accuracy, misses, a safe confidence cutoff, and what changes between Jev versions.

```sh
claude plugin marketplace add jevtool/claude-plugins
claude plugin install jev-eval@jevtool
```

See [skills/jev-eval/SKILL.md](skills/jev-eval/SKILL.md) for exactly what Claude does. Uses the [jevtool CLI](https://github.com/jevtool/jevtool) via `npx`.
