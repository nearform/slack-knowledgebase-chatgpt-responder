# Onboarding verify report

| Field | Value |
|---|---|
| Date | 2026-09-09 |
| Git commit | 924caf4 (artifacts audited), report written on the following commit |
| project-onboard version | 1.5.0 |
| Run mode | onboard |
| Host | Claude Code |
| Verify rounds | 3 of max 3, plus 2 external review rounds and a confirmation audit |
| Overall confidence | 95.75/100 (confirmation audit) |
| Score source | confirmation audit, **with four low-severity text corrections applied after it** (enumerated below) |
| ≥95 gate | met |

## Verify rounds

| Round | Overall | Findings | Fixed | Outcome |
|---|---|---|---|---|
| 1 (internal) | 94.5/100 | 8 | 7 | remediated → round 2 |
| 2 (internal) | 93.4/100 | 6 | 6 | remediated → round 3 |
| 3 (internal) | 97.9/100 | 4 | 0 | gate met, loop ended |
| Copilot review 1 | n/a | 18 | 12 | external review after the PR opened; 6 declined |
| Copilot review 2 | n/a | 12 | 11 | external review; flagged that this report had gone stale |
| Confirmation audit | 95.75/100 | 5 | 3 | **final score**, graded the post-review artifacts |

Each internal round and the confirmation audit were run by a separate fresh-context
auditor given only the repo path, the artifact paths and the audit brief: no generation
transcript, no previous findings, no fix list.

**Why round 3's 97.9 is not the final score.** Round 3 passed the gate, so the loop ended
there and 97.9 correctly described the artifacts at that moment. Two rounds of external
review then found real errors and 23 fixes were applied, which made that number describe a
state no longer on disk. Copilot's second review caught this report still presenting it as
current. The confirmation audit re-graded the fixed artifacts cold, and 95.75 is that
score. It is lower than 97.9 and that is expected: a different auditor, a larger artifact
surface, and five nits round 3 did not look for.

**Four corrections were applied after the confirmation audit** (findings 1, 2, 3 and 4
below, every one marked `fixed` in the findings table). They are text-only and objective.
The score above therefore predates them by four low-severity edits, each enumerated so the
delta is reproducible rather than hand-waved. No further audit was run, because re-auditing after every trivial correction
is the regress the round cap exists to prevent.

## Scores (confirmation audit)

| Artifact | Score | Justification |
|---|---|---|
| AGENTS.md | 93/100 | Every command, version, port, structure row and boundary traces to source; two low quantifier nits, both since corrected. |
| docs/README.md | 98/100 | Three-row index, all links resolve, nothing overstated. |
| docs/crawler.md | 97/100 | All 14 line refs exact, both cited tests assert their criteria, unguarded labels honest, truncation defect flagged as code-as-is. |
| docs/embeddings-creation.md | 92/100 | Contracts and constants exact and the chunking defect framed as an invariant to restore; two imprecise notes, both since corrected. |
| docs/slack-bot.md | 97/100 | Eleven guarded criteria verified against opened tests, precedence gap and JSDoc/fixture staleness disclosed rather than papered over. |
| packages/crawler/AGENTS.md | 97/100 | Layout, commands, env and rate-limit numbers verified; dead-code note correct. |
| packages/embeddings-creation/AGENTS.md | 95/100 | All claims true; omits the tail-loss defect its spec documents, with a pointer to the spec present. |
| packages/slack-bot/AGENTS.md | 97/100 | The initialization/healthz/import-load triple, floor-before-guard and per-pid file all exactly right. |
| **Overall** | **95.75/100** | No hallucinated tests, no dishonest coverage label, no broken pointer, suite state reported truthfully. Five low-severity precision nits only. |

## Findings (confirmation audit, most severe first)

| Severity | Category | Location | Defect | Disposition |
|---|---|---|---|---|
| low | contract-claim | `docs/embeddings-creation.md:55` | Acceptance criterion said "retried up to 5 times"; `numOfAttempts: 5` is 5 total attempts (4 retries), as the same file says at line 27 | fixed |
| low | agents-md-fact | `AGENTS.md:153` | "`IS_LOCAL_ENVIRONMENT` only redirects Cloud Storage" is false: it also suppresses the bot's Pub/Sub subscribe | fixed |
| low | agents-md-fact | `AGENTS.md:57` | "set by the `make` targets" overstated: `embeddings` and `bot-expose` do not set it | fixed |
| low | other | `docs/embeddings-creation.md:112` | "the backoff path is uncovered" imprecise: `backOff` runs on the happy path; the retry branch is what is unexercised | fixed |
| low | other | `Makefile:33` | Repo defect, not an artifact claim: `make bot-ask` calls a `try:bot` script that does not exist | reported |

## Category rollup

| Category | Count |
|---|---|
| agents-md-fact | 2 |
| mis-map | 0 |
| under-claim | 0 |
| partial-guard | 0 |
| fabricated-coverage | 0 |
| contract-claim | 1 |
| suite-honesty | 0 |
| navigation | 0 |
| other | 2 |

## Fixes applied this run

Internal rounds 1 and 2 (13 fixes) are recorded in `history/verify-2026-09-09.md`.

Copilot review 1 (12 fixes): the CSV round-trip explanation in two notes and a spec (the
producer emits a named `index` column and `csv2json` preserves it; the empty-string key is
only in the slack-bot fixtures and JSDoc); the false "one place that swallows" absolute;
the fractional `MAX_CONTEXT_TOKENS` claim in two files; an acceptance criterion that
encoded the dropped-tail defect as a contract; the non-idempotent bucket-notification
step; per-question egress overstated as the whole corpus; unawaited Slack calls rejecting
outside the outer catch; `createContext` vs `getAnswer`; three test runners not one; "three
routes" vs a two-row table; `notion.js:104` to `:108`.

Copilot review 2 (11 fixes): the `make` targets removed from the safe boundary tier, since
`IS_LOCAL_ENVIRONMENT` does not stop outbound calls and `make bot-expose` opens a public
tunnel; unpaginated Notion child listing documented as a truncation defect; the absent
Pub/Sub topic creation recorded in three places; at-least-once rather than exactly-once
egress; transcription errors described as unhandled and process-fatal rather than
swallowed; the summarize shortcut's real failure scope; `users.info` is awaited; the
`No data frame provided` precondition restated as reachable only when a load resolves
without assigning.

Post-confirmation-audit (4 fixes): findings 1, 2, 3 and 4 above.

**One process failure worth recording.** The retry-wording fix was reported as applied
during internal round 2 but never landed: the search string did not match because the
sentence wrapped mid-phrase, and that edit batch used a non-asserting string replace, so
it silently no-oped. The confirmation audit caught it. Every edit batch after that point
asserts its search string is present before replacing.

## Remaining / judgement calls

- `Makefile:33` `make bot-ask` calls a non-existent `try:bot` script. A repo defect, not an
  artifact defect; deliberately absent from every command list so nobody "fixes" the docs
  to match it.
- Three findings against the vendored skill scripts under
  `.agents/skills/understand-codebase/scripts/` were raised in review and declined here:
  a relative `require` path that misdetects the Quartz major version, a `${VAR:-default}`
  expansion that makes the documented empty-string path unreachable, and a frontmatter
  check that accepts a missing `type`. All three are genuine upstream bugs. They are not
  fixed in this repo because the tree is vendored verbatim from the public
  `nearform/skills` and hashed in `skills-lock.json`, so editing it here forks it from
  upstream and breaks the next `npx skills update`. To be reported upstream.
- Code defects documented but not fixed, each deserving its own test-first change: the
  `splitIntoMany` trailing-chunk loss, the unpaginated Notion child listing, the unhandled
  `downloadAudio` errors and its uncleaned temp files, the silently-skipped failing Notion
  subtree, and the two deploy provisioning gaps.

## Notes for plugin maintainers

- **An internal audit loop that ends on a passing score goes stale the moment anything is
  fixed afterwards.** External review added 23 fixes after the gate passed, and the report
  kept presenting the pre-fix score as current. The report needs a way to be invalidated
  by later commits, or a note that its score binds only to the commit it names.
- **Non-asserting string replacement silently no-ops.** One fix was reported as applied and
  was not. Any generated edit should assert its target text exists before replacing.
- **Tightening a vague claim is where new errors enter.** Two of Copilot's second-round
  findings were absolutes introduced by the first round's fixes ("every chunk once", "none
  of these calls are awaited"). A fix round should re-verify the claims it rewrites, not
  just the ones it was told about.
- **Boundaries sections need the same grounding as facts.** "The `make` targets are
  local-only" was inferred from `IS_LOCAL_ENVIRONMENT` existing, not from reading what it
  gates. That produced advice that would have let an agent open a public tunnel without
  asking. Verify every safety claim against the code path, not the flag's name.
- **Acceptance criteria must state invariants, not observed defects.** Writing "the
  trailing chunk is dropped" as a criterion told a future agent to preserve data loss.
  When a spec documents a defect, the criterion should carry the invariant and mark the
  implementation as violating it.
