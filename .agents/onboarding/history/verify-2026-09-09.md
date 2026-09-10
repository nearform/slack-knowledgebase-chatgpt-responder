# Onboarding verify report

| Field | Value |
|---|---|
| Date | 2026-09-09 |
| Git commit | c4bc5ac |
| project-onboard version | 1.5.0 |
| Run mode | onboard |
| Host | Claude Code |
| Verify rounds | 3 of max 3 (+ confirmation audit: no) |
| Overall confidence | 97.9/100 (final, post-fix) |
| Score source | round 3 passed gate |
| ≥95 gate | met |

## Verify rounds

| Round | Overall | Findings | Fixed | Outcome |
|---|---|---|---|---|
| 1 | 94.5/100 | 8 | 7 | remediated → round 2 |
| 2 | 93.4/100 | 6 | 6 | remediated → round 3 |
| 3 | 97.9/100 | 4 | 0 | gate met — **final score**, graded the artifacts as they now stand |

Each round was run by a separate fresh-context auditor given only the repo path, the
artifact paths and the audit brief: no generation transcript, no previous findings, no fix
list. Round 3 passed the gate, so no fixes followed it and its score describes the
artifacts on disk. Rounds 1 and 2 carry the score at the start of that round, before its
fixes.

## Scores (final post-fix audit, round 3)

| Artifact | Score | Justification |
|---|---|---|
| AGENTS.md | 93/100 | Every command, version, port, structure row and security claim traces to config; docked for one false absolute ("the one place that swallows") and aggregate-runner phrasing of the test count. |
| docs/README.md | 100/100 | Three-row index, all links resolve, each description matches its spec. |
| docs/crawler.md | 96/100 | All 7 acceptance criteria labelled correctly and the snapshot genuinely guards both the empty-text filter and the `Name` title; one line ref points at a statement start rather than the cited expression. |
| docs/embeddings-creation.md | 98/100 | Constants, concurrency, backoff params, CSV headers and the never-flushed-chunk quirk all exact; coverage labels honest. |
| docs/slack-bot.md | 96/100 | 18 criteria, every guard opened and confirmed (including the eight env-fallback cases and the "no test sets both" honesty); one criterion attributes `createContext`'s line to `getAnswer()`. |
| packages/crawler/AGENTS.md | 100/100 | Layout, retry and concurrency numbers, CSV contract and the unreferenced `csv.js` all verified. |
| packages/embeddings-creation/AGENTS.md | 100/100 | Constants, `cross-env` test script, 2GiB rationale and output contract all verified. |
| packages/slack-bot/AGENTS.md | 100/100 | Layout, env list, the three-part initialize/healthz/import-load description and the pid-scoped cache file all verified. |
| **Overall** | **97.9/100** | Fully grounded: no hallucinated tests, no dishonest coverage label, no false green, no invented fact or broken pointer. Four low-severity precision nits remain. |

## Findings (final post-fix audit, most severe first)

| Severity | Category | Location | Defect | Disposition |
|---|---|---|---|---|
| low | agents-md-fact | `AGENTS.md:101` | "the bot's message handler is the one place that swallows" is false: `getAnswer.js:222` and `bot.js:66` also swallow deliberately | reported |
| low | contract-claim | `docs/slack-bot.md:15` | The embed/rank/assemble behaviour is attributed to `getAnswer()` but cites `getAnswer.js:97`, which is `createContext` | reported |
| low | suite-honesty | `AGENTS.md:116` | "the runner reports 24 passing" is an aggregate of three separate `node:test` runners (4, 1, 19); the per-workspace breakdown on the same line is exact | reported |
| low | navigation | `docs/crawler.md:17` | Cites `notion.js:104` (statement start); the `rich_text[].plain_text` map is at `:108` | reported |

Round 3 passed the ≥95 gate, so per the procedure no fixes were applied after it: the
score above grades the artifacts exactly as they stand. These four nits are offered to the
user instead. Applying them would require a fresh confirmation audit to keep the score valid.

## Category rollup

| Category | Count |
|---|---|
| agents-md-fact | 1 |
| mis-map | 0 |
| under-claim | 0 |
| partial-guard | 0 |
| fabricated-coverage | 0 |
| contract-claim | 1 |
| suite-honesty | 1 |
| navigation | 1 |
| other | 0 |

## Fixes applied this run

Round 1 (7 fixes):

- Corrected the `summarize` shortcut misattribution in both `AGENTS.md` and
  `docs/slack-bot.md`: `slack_manifest.yaml` declares OAuth scopes and the `message.im`
  bot event, while the shortcut is registered in code at `summarize.js:20`.
- Made the documented root `npm run lint` command true again by adding `.agents/**`,
  `.claude/**`, `.cursor/**` and `.github/skills/**` to the ignores in
  `eslint.config.mjs`. Vendoring the skills had introduced 116 prettier errors from
  third-party skill files. **This is a change to project code, not generated content.**
- Reworded the slack-bot test count: the runner reports 19, of which 17 live in the five
  test files and 2 are test-less fixture modules under `test/mocks/`.
- Corrected the `MAX_TOKENS` reference from `create-embeddings.js:8` to `:11`.
- Split the completion claim across its real lines: prompt array `getAnswer.js:172`,
  completion call `:209`, `gpt-4.1` default `:144`.
- Narrowed `"type": "module"` "in every package" to "each workspace package" (the root
  manifest has no `type` field).
- Qualified the "named exports" house-style claim: `bot.js` and `summarize.js`
  default-export.

Round 2 (6 fixes):

- Split the context-budget precedence criterion: `maxLength` beating the 4000 default is
  guarded, but `maxLength` beating a set `MAX_CONTEXT_TOKENS` is now marked unguarded,
  because the cited test deletes the environment variable before calling.
- Corrected "retried up to 5 times" to "up to 5 times in total (4 retries)", matching
  `numOfAttempts: 5` and the same file's own wording nine lines earlier.
- Documented that `splitIntoMany` only pushes a chunk when the next sentence would exceed
  the budget, so the final accumulated chunk of an over-long record is never flushed and
  its trailing text is dropped. Recorded as code-as-it-stands, not intent.
- Corrected the `sinon` attribution: used in all three packages, declared in
  `packages/slack-bot` and resolved by workspace hoisting.
- Disclosed the fixture-module inflation in AGENTS.md's test count (24 reported, 22 real).
- Corrected "does not persist anything": `downloadAudio` writes `./<file id>.mp4` to the
  working directory and never removes it (`utils.js:52`).

## Remaining / judgement calls

- The four low-severity nits in the findings table above. Recommendation: apply them, then
  run one confirmation audit in a fresh session so the reported score still grades what is
  on disk.
- **Not an artifact defect, but worth fixing in the repo:** `Makefile:33` (`make bot-ask`)
  calls `npm run try:bot --workspace=slack-bot`, and no `try:bot` script exists in
  `packages/slack-bot/package.json`. The target is broken. No artifact cites it, and
  verification audits the artifacts rather than the codebase, so it was left alone.
- **A genuine code defect surfaced by round 2 and now documented in the spec:** the
  dropped trailing chunk in `splitIntoMany`. Every record longer than 500 tokens loses its
  tail before being embedded. Worth a separate fix with a failing test first.

## Notes for plugin maintainers

- Vendoring skills into a repo whose linter globs the repository root breaks the very
  `lint` command the generated AGENTS.md tells agents to run. The vendor step should add
  the canonical skills directory (and the per-tool symlinks) to the project's lint/format
  ignores, or at least check the documented lint command still passes afterwards.
- `node:test` counts non-test files matched by its default glob (here, fixture modules
  under `test/mocks/`) as passing files. Generation took the runner's total at face value
  and over-stated the test count. Spec generation should distinguish "tests the runner
  reports" from "tests in the named files".
- A criterion phrased "given both X and Y, Y wins" is easy to mislabel as guarded when the
  test deliberately removes X. Precedence criteria deserve an explicit check that the test
  actually sets both inputs.
- `numOfAttempts` style options (total attempts) get restated as "retries" one paragraph
  later. Retry/attempt arithmetic is worth a targeted check.
- Bare filenames used as prose shorthand (`utils.js`, `bot.js`) fail a backticked-path
  resolution check. Generation should write repo-relative paths inside backticks from the
  start.
