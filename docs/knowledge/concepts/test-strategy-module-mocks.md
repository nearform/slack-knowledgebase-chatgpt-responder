---
title: Test strategy and module mocks
type: concept
tags: [testing, node-test, mocking]
source_paths:
  - packages/crawler/test
  - packages/embeddings-creation/test
  - packages/slack-bot/test
source_commit: 4a9f973
created: 2026-09-09
updated: 2026-09-10
---

# Test strategy and module mocks

`node:test` with `--experimental-test-module-mocks`, plus `sinon` for spies and fakes. No
Jest, no Vitest. Understanding two constraints explains the shape of every test file here.

## Constraint 1: a specifier can be mocked once per process

`mock.module('../src/utils.js', ...)` registers a mock for that specifier for the whole
process. Two tests in one file cannot mock the same module differently. The suite works
around this in three ways:

- **Cache-busting import queries.** `await import('../src/getAnswer.js?t=1')` forces a
  fresh module instance per test, since the query string makes it a different specifier.
- **Splitting by mock, not by subject.** There are four separate `getAnswer*` test files
  because each needs a different `utils.js` mock: a normal fixture, a large-chunk fixture,
  a failure-injecting one, and one for the question guard.
- **Mocking the framework.** `messageHandler.test.js` mocks `@slack/bolt` itself, capturing
  the function `app.event('message', ...)` registers so the handler can be invoked directly
  with a stub `client`. That is what made the handler testable without a Slack workspace.
- **A file with a mutable flag.** `getAnswerInitialization.test.js` keeps a
  `downloadFailure` variable the mock closes over, so tests flip behaviour without
  re-registering the mock.

## Constraint 2: module-scope code runs at import

`isLocalEnvironment` is read at import ([[local-environment-emulation]]), and
`getAnswer.js` starts loading embeddings at import
([[embedding-lifecycle-and-warm-start]]). So mocks must be registered **before** the
dynamic import, at file top level. `download.test.js` exists as its own file purely to
delete `IS_LOCAL_ENVIRONMENT` before importing `utils.js`, and its comment says so.

## What the suite is good at

- **Exact-argument assertions** over the network boundary: the entire prompt array
  ([[prompt-contract]]), exact `download`/`upload` arguments, literal expected CSV output.
- **Parametrised edge cases**: eight unusable `MAX_CONTEXT_TOKENS` values.
- **Provenance**: distances asserted against the original Python implementation
  ([[cosine-distance-ranking]]).
- **Explanatory comments.** The budget fixture spells out the arithmetic (1004, 2008,
  3012, 4016, 5020). Read those comments before changing a fixture.
- **Pure functions extracted so they can be asserted directly.** `messageEvents.js` exists
  partly so the event-filtering rules are testable without a Bolt app. See
  [[slack-event-surface]].

## Where it is thin

No tests at all for `summarize.js`, `/healthz`, the Pub/Sub refresh, `splitIntoMany`, the
retry paths, or the local branch of `upload`. What remains untested is the rate-limit-facing
crawler code and the summarise path, which is also the hardest to mock. The Slack-facing
answering path is no longer in that group: `messageEvents.test.js`,
`messageHandler.test.js` and `transcribe.test.js` cover it.

One reporting quirk: node's default glob executes the fixture modules under
`test/mocks/` as test files, so the runner's 116 for slack-bot includes two files
containing no tests. There are 132 real tests across the repo, 134 reported: 10 in crawler,
8 in embeddings-creation, and 114 of slack-bot's 116.

Vendored guidance for this repo now lives in `.agents/skills/test-unit-guidelines/` and
`.agents/skills/test-review/`.
