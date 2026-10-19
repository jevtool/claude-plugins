---
name: jev-eval
description: Measure how well a Jev (TypeSafe System One) judgment works on real data before shipping it. Use when the user is adding, changing or debugging a Jev choice/noul/score question, choosing a confidence threshold, comparing Jev versions (for example jev-1.13 vs jev-1.14), or asks "is Jev accurate enough for this". Builds a labeled suite and runs `jevtool eval`.
---

# Evaluate a Jev judgment with jevtool

Jev returns typed answers with probabilities. Whether those answers are right for *this* user's data is an empirical question. Answer it with a labeled suite and `jevtool eval`, not by eyeballing a few calls.

## 1. Build the suite

Write one JSON file, for example `jev/<judgment-name>.eval.json`:

```json
{
  "name": "support-triage",
  "model": "jev-1.13.0",
  "target": 0.95,
  "questions": { "<id>": { "type": "choice|noul|score", "instructions": "...", "criteria": "..." } },
  "cases": [ { "id": "c1", "state": { "...": "..." }, "expect": { "<id>": "<label>" }, "tags": ["en"] } ]
}
```

- Copy `questions` exactly from the application code, so the suite tests what ships. If the code builds questions dynamically, add a small export or script that writes them.
- `state` must be what the application actually sends, built by the same code path where possible.
- `expect`: an option string (or array of acceptable options) for a Choice, `true`/`false` for a Noul, a 0-based level index for a Score. Omit or set `null` to leave a question unscored for that case.
- Cases: prefer real, already-labeled examples from the user's data (support tickets with resolutions, moderated content, reviewed records). Include the hard ones: negations, mixed intents, other languages, adversarial text. 20–50 cases is a useful start. Ask the user before reading production data you have not been given.
- Tag cases (language, source, segment) so accuracy can be split.
- Pin a versioned model ID (`jev-1.13.0`), not an alias, when thresholds will be tuned.

To start from a template: `npx -y jevtool eval --examples`, then `npx -y jevtool eval example:<name> --save <file>`.

## 2. Run it

```sh
npx -y jevtool eval jev/support-triage.eval.json
npx -y jevtool eval jev/support-triage.eval.json --compare jev-1.14.0 --order-check
```

Requires `TYPESAFE_API_KEY` in the environment. If it is missing, tell the user where to create one (https://console.typesafe.ai) rather than guessing. The suite's `state` values are sent to TypeSafe; labels stay local.

## 3. Read the report and improve the question

For each question the report gives accuracy, per-tag accuracy, every miss with its certainty, and a suggested cutoff: the lowest certainty at which automatically handled cases still reach `target`.

- **Confident misses** (high certainty, wrong) usually mean the instructions or criteria are read literally. Jev answers the words written, not the intent. Add the missing boundary to the criteria (for example "refund: money back for a specific charge that already happened"), then re-run the whole suite and confirm nothing that passed before now fails.
- **Low-certainty misses** are expected. Route cases below the suggested cutoff to a person or a larger model in the application code.
- **Order flips** (`--order-check`) mean the Choice leans toward the first option. Tighten the option descriptions.
- Keep arithmetic, counting and date comparison in code; pass the computed result as state.
- If a check mixes several judgments (for example "spam" and "needs a reply"), split it into separate questions and combine them in code.
- Do not tune criteria to individual cases until the suite is a fair sample; overfitting a 15-case suite proves little.

## 4. Gate it

Add the suite to CI so question edits and model upgrades cannot silently regress:

```sh
npx -y jevtool eval jev/support-triage.eval.json --min-accuracy 0.9 --json --output jev-eval.json
```

Exit codes: 0 passed, 1 below `--min-accuracy`, 2 some requests failed, 3 configuration error.

Report results to the user plainly: accuracy, how much can be automated at what cutoff, the misses that matter, and what changed. Say that the numbers describe this suite, not a guarantee.
