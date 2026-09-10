# Onboarding verify report

| Field | Value |
|---|---|
| Date | 2026-09-10 |
| Git commit | `633de22` plus this run's documentation fixes, committed together with this report |
| project-onboard version | 1.5.0 |
| Run mode | standalone-verify |
| Host | Claude Code |
| Verify rounds | 1 of max 3 (+ confirmation audit: yes) |
| Overall confidence | 97.0/100 (final, post-fix) |
| Score source | confirmation audit |
| ≥95 gate | met |

## Why this report was re-run

The previous report audited `924caf4` and scored 95.75. Five commits landed after that
grade, and one of them changed the code underneath the artifacts rather than the artifacts
themselves:

- `1126b6d`, `d86d7b7` corrected documentation defects found in review.
- `4a9f973` merged `origin/master`, bringing `804120c` (#984). The branch had been cut from
  `c4bc5ac` about 17 hours after `#984` landed on master, so every `slack-bot` document in
  it described source that had already been replaced. `#984` rewrote the transcription path,
  added `packages/slack-bot/src/messageEvents.js`, and took the `slack-bot` suite from 19
  tests to 105.
- `8cfab28` re-derived the `slack-bot` documentation against the merged code.
- `633de22` fixed two stale line citations and a miscount found reviewing that work.

So roughly a third of the knowledge notes were rewritten after the 95.75 was awarded, while
the report still described the only delta as "four low-severity text corrections". A score
that grades artifacts which have since been rewritten is worse than no score, which is why
this is a full re-run rather than an edit to the previous report.

## Verify rounds

| Round | Overall | Findings | Fixed | Outcome |
|---|---|---|---|---|
| 1 | 97.6/100 | 5 | 2 | gate met; two factual defects fixed anyway → confirmation audit |
| Confirmation | 97.0/100 | 4 | 0 | **final score**, graded the fixed artifacts |

Round 1 passed the ≥95 gate outright, so its score could have stood as final. Two of its
findings were genuine factual defects, so they were fixed and the artifacts re-graded
instead: a score is the measure, not the objective, and reporting 97.6 while leaving
known-wrong claims in place to preserve it would invert the point of the gate. Round 1's
97.6 predates its own fixes and appears here for history only.

Both rounds were run by a fresh auditor given only the repository path, the artifact paths,
the checklist and the rubric: no generation context, and the confirmation auditor was not
told what round 1 found.

The 0.6 difference between the two rounds is auditor-to-auditor variance, not a regression,
and the aggregate hides the change that matters. Round 1 found three factual defects; the
confirmation audit found none. `AGENTS.md`, the one scored artifact that was actually fixed,
went up (96 to 97). The decrease comes from a stricter second reader: it applied the
`src/csv.js` naming nit at three sites rather than none, and found a genuine partial-guard
on the compound `downloadAudio` criterion that round 1 missed. Treat differences of this
size as equivalent rather than as a trend, and read the findings table rather than the
average.

## Scores (final post-fix audit)

| Artifact | Score | Justification |
|---|---|---|
| `AGENTS.md` | 97/100 | Every command, version, workflow row, port, swallow-site citation and security claim verified against source; ports come from the `start` scripts rather than the README. |
| `docs/README.md` | 99/100 | All five links resolve and each one-line description matches the spec it points at. |
| `docs/crawler.md` | 96/100 | All 14 citations land, all four guarded criteria genuinely asserted, all three unguarded ones genuinely uncovered. |
| `docs/embeddings-creation.md` | 98/100 | The hard claims hold exactly: the never-flushed tail, the `["."]`-only outcome for a boundary-free record, and the mis-guarded notification step in `deploy-step.yml`. |
| `docs/slack-bot.md` | 94/100 | Largest claim surface: 40+ citations and every quantifier verified. One compound criterion is only half-asserted across its five failure modes, and one absolute is unqualified locally though correct in Non-goals. |
| `packages/crawler/AGENTS.md` | 96/100 | Layout, retry, concurrency and delay figures verified; the unreferenced `src/csv.js` note is correct in substance. |
| `packages/embeddings-creation/AGENTS.md` | 98/100 | Handler and deployed names, constants, 5-attempt/5s backoff, concurrency 10, 2GiB and the `cross-env` test env all match. |
| `packages/slack-bot/AGENTS.md` | 98/100 | Six predicates counted, both halves of `isTranscribableFile`, the four distinct replies, and every `getAnswer.js` / `utils.js` / `messageEvents.js` / `bot.js` citation land correctly. |
| **Overall** | **97.0/100** | Zero hallucinated tests, zero mislabelled coverage claims, zero invented facts, zero broken pointers, suite state verified by running it. Four low-severity judgement calls only. |

## Findings (final post-fix audit, most severe first)

No factual defects. All four remaining findings are judgement calls, left for a human
decision rather than rewritten.

| Severity | Category | Location | Defect | Disposition |
|---|---|---|---|---|
| low | partial-guard | `docs/slack-bot.md:204-208` | Compound criterion ("rejects **and** leaves no file behind") across five failure modes, but only the mid-stream case asserts no leftover file; connect, write, timeout and non-2xx assert rejection only. Also credits ten `downloadAudio` cases where five are failure-mode cases. | reported |
| low | contract-claim | `docs/slack-bot.md:82-83` | "documents, images and videos are never sent to OpenAI" is true of the answering path only; `summarize.js:71-89` base64s and uploads attachments. Non-goals at `:245-248` qualifies it correctly, so the imprecision is local. | reported |
| low | contract-claim | `docs/crawler.md:113`, `packages/crawler/AGENTS.md:42` | `src/csv.js` exports `generateCsv`, not a duplicate of `createCsv` by name. Same one-line `json2csv` body and genuinely unreferenced, so the substance holds and the naming is loose. | reported |
| low | other | `AGENTS.md:45-56` | Commands block omits `make bot-ask`, whose `npm run try:bot --workspace=slack-bot` names a script `packages/slack-bot/package.json` does not declare, so the target is broken. Defensible as curation (the block also omits `make init` and `npm run dev`). | reported |

## Category rollup

| Category | Count |
|---|---|
| agents-md-fact | 0 |
| mis-map | 0 |
| under-claim | 0 |
| partial-guard | 1 |
| fabricated-coverage | 0 |
| contract-claim | 2 |
| suite-honesty | 0 |
| navigation | 0 |
| other | 1 |

## Suite state (executed, not assumed)

Both auditors ran the suite independently and observed the same figures, matching what the
artifacts claim:

| Workspace | tests | suites | pass | fail |
|---|---|---|---|---|
| crawler | 4 | 1 | 4 | 0 |
| embeddings-creation | 1 | 0 | 1 | 0 |
| slack-bot | 105 | 14 | 105 | 0 |

110 reported, 108 real: two of `slack-bot`'s 105 are the test-less `test/mocks/` fixture
modules that node's default glob executes. `npm run lint` passes. `graph-lint` reports 32
notes with 0 dead links, 0 ambiguous links, 0 orphans, 0 frontmatter problems and 0 stale.

## Fixes applied this run

Round 1, in the scored artifact set:

- `docs/slack-bot.md:18`: the citation for "stops at the first chunk that would exceed it"
  was `getAnswer.js:124`, the running-total increment. Now `:124-127`, spanning the
  accumulate and the `break`.
- `AGENTS.md:38`: the `.github/workflows` row omitted `notify-release.yml` and CI's
  Dependabot automerge job. Both now named.

Round 1, in the knowledge base (not scored, corrected for consistency):

- `docs/knowledge/concepts/context-token-budget.md:21`: the same citation was attached
  directly to a sentence about the loop breaking, which made it the more misleading of the
  two copies. Now `:126-127` for the break and `:124` for the `+ 4`.
- Seven notes were flagged stale by `graph-lint --git-dir` because a file in their
  `source_paths` changed after their `source_commit`. Each was verified claim by claim
  against head before its stamp was bumped to `633de22`, on the basis that the stamp is a
  claim that someone checked the note at that commit. Six were correct as written. Five of
  the seven were flagged only by `source_paths` overlap and describe pipeline behaviour
  `#984` did not touch.
- `docs/knowledge/architecture/local-environment-emulation.md`: attributed
  `download.test.js` being a separate file solely to the import-time environment flag. The
  file's own comment gives a second, distinct reason (`mock.module` registers a specifier
  once per process). Both reasons now named.

## Remaining / judgement calls

All four findings above are reported rather than fixed. Recommendations:

- **`docs/slack-bot.md:204-208`** is the one worth acting on. Splitting the compound
  criterion so the four rejection-only modes are not credited with the cleanup assertion
  would make the label exactly honest. Recommend fixing; it is a small edit and the
  partial-guard class is the one these artifacts most need to get right.
- **`docs/slack-bot.md:82-83`** would read better as "never sent to OpenAI by the answering
  path", since `summarize.js` deliberately does upload attachments. Recommend fixing.
- **`src/csv.js` naming** in two files: recommend saying it duplicates the behaviour of
  `createCsv` while exporting `generateCsv`, which is what the code does. Low value, purely
  a precision gain.
- **`make bot-ask`** is a genuine repository defect rather than an artifact defect: the
  Makefile target calls a script that does not exist. It is already recorded as a known
  defect at `docs/knowledge/tours/start-here.md:65`. Fixing it needs a code change, which is
  out of scope for verification. Recommend a follow-up issue, or deleting the target.

## Notes for plugin maintainers

- **Verify the branch's base, not just the branch.** The dominant failure this run was
  artifacts that accurately described code which had already been replaced on master. No
  check against the artifacts could surface it, because generation, review and verification
  all read the same stale tree. Generation should refuse, or at minimum warn, when the
  branch is behind its base: `git rev-list --count HEAD..origin/<base>` is the whole test.
- **Line citations are the most fragile claim class.** Prose stays true while line numbers
  move under it, so a code change in the branch's base silently invalidates citations in
  notes whose text is still correct. This run found 22 stale citations across three passes,
  most in notes nobody had flagged. A citation resolver in `graph-lint` would catch these
  mechanically.
- **A citation-checking pattern must cover the bare `` `:NN` `` continuation form.** One pass
  machine-verified `file.js:NN` citations and reported itself complete while leaving two bare
  continuations stale, because the pattern did not match them.
- **Counts of things are quantifier claims and drift silently.** A deny list grew from 27 to
  28 entries and two documents kept the old number. Worth checking every stated count against
  the literal it describes.
- **`graph-lint`'s stale check is off by default.** It needs `--git-dir` and reports stale as
  a warning with exit 0, so a clean-looking run can still hide stale notes. Consider
  defaulting it on when the notes directory is inside a git repository.
