---
name: jev-verify
description: Check a finished coding task against an explicit acceptance checklist, the Git diff and freshly executed tests before reporting it done. Use at the end of a multi-step coding task, when the user asks "is it really done?", or when a repository contains .jevtool/acceptance.json. Runs `jevtool verify`.
---

# Verify a delivery with jevtool

Before saying a task is complete, check the evidence: what changed, whether the linked tests pass now, and whether each requirement is supported by the diff. A failing linked test always wins over any model judgment.

## 1. Write or update the checklist

If `.jevtool/acceptance.json` does not exist, create it with `npx -y jevtool init --task "<one-line task>"` and edit it. Keep each requirement small and checkable:

```json
{
  "version": 1,
  "task": "Reject blank passwords without changing styles",
  "base": "HEAD",
  "criteria": [
    { "id": "login", "description": "Whitespace-only passwords are rejected", "paths": ["src/login.js"], "tests": ["login-tests"] },
    { "id": "styles", "kind": "unchanged", "description": "Keep CSS unchanged", "paths": ["**/*.css"] }
  ],
  "tests": [ { "id": "login-tests", "command": ["node", "--test", "test/login.test.js"] } ]
}
```

Kinds: `judgment` (default, Jev checks the diff supports the requirement), `changed`, `unchanged`, `tests`. Test commands are argv arrays with no shell. Show the user the checklist and the test commands before running them for the first time.

## 2. Run the checks

```sh
npx -y jevtool verify --run-tests            # local evidence only, no model request
npx -y jevtool verify --run-tests --judge    # add Jev judgments (needs TYPESAFE_API_KEY)
```

For committed work, pass the merge base: `--base <sha>`.

`--judge` sends the task, requirement text, matching diff excerpts and test output to TypeSafe after best-effort credential redaction. Use it only when the user is fine with that.

## 3. Act on the result

- Exit 0: every check is supported. Report it, and say a supported check means the evidence supports the requirement, not that the code is proven correct.
- Exit 1: something failed. Fix it, then re-run. Do not report the task as done.
- Exit 2: review needed (missing evidence, uncertain judgment, too many files). Tell the user exactly which checks need a human look.
- Exit 3: configuration or operational error. Report the error message.
