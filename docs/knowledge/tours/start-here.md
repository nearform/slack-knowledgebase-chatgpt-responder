---
title: Start here
type: tour
tags: [onboarding, reading-path]
source_commit: c4bc5ac
created: 2026-09-09
updated: 2026-09-09
---

# Start here

An ordered path for someone new to this repo. Roughly 30 minutes of reading, and you will
know where everything lives and which parts are dangerous to change.

## 1. What this is (5 min)

- [[project-overview]] — three deployables, and why the split exists.
- [[retrieval-augmented-answering]] — the one idea the repo serves. Read the "what this
  design cannot do" section carefully; it sets expectations for everything else.

## 2. How the pieces connect (5 min)

- [[pipeline-data-flow]] — the bucket-as-message-bus design. This is the mental model
  everything else hangs off.
- [[csv-as-interchange-format]] — the contract that couples the stages.

## 3. The three services, skimmed (10 min)

- [[crawler-module]] — the simplest. Start here.
- [[embeddings-creation-module]] — one function, one important guard.
- [[slack-bot-module]] — the only one with real structure.

## 4. The parts that will bite you (10 min)

Read these before changing anything in the bot:

- [[embedding-lifecycle-and-warm-start]] — four coupled behaviours. **The single most
  important note in this knowledge base.**
- [[context-token-budget]] — including why the guard floors before it checks.
- [[prompt-contract]] — product behaviour expressed as prose, and asserted verbatim by a
  test.

## 5. Then, as needed

- Running it locally: [[local-environment-emulation]].
- Deployment and infra: [[gcp-deployment-topology]].
- Writing tests here: [[test-strategy-module-mocks]].
- The domain vocabulary: [[knowledge-base-content]], [[content-chunk]],
  [[question-and-answer]].
- The odd one out: [[summarization-request]], a second capability sharing the deployable.

## Then walk a flow end to end

- [[answer-a-question-end-to-end]] — the read path.
- [[refresh-the-knowledge-base]] — the write path.

## Known rough edges, in one place

Each is described in its own note; collected here so nobody rediscovers them the hard way.

| Issue | Note |
|---|---|
| The trailing chunk of every over-long record is dropped before embedding | [[chunking-strategy]] |
| `make bot-ask` calls a `try:bot` script that does not exist | see `Makefile:33` |
| Transcription temp files (`./<id>.mp4`) are never cleaned up, and download errors are unhandled (can crash the process, not degrade quietly) | [[audio-transcription-path]] |
| Notion child-block listing is not paginated, so large pages are silently truncated | [[crawler-module]] |
| An over-long sentence emits a spurious `"."` chunk that gets embedded | [[chunking-strategy]] |
| The deploy workflow never creates the Pub/Sub topic, and its notification step never runs | [[gcp-deployment-topology]] |
| A persistently failing Notion block subtree is skipped silently | [[resilience-and-rate-limiting]] |
| `bot.js` and `summarize.js` have no tests at all | [[test-strategy-module-mocks]] |
| `packages/crawler/src/csv.js` is unreferenced dead code | [[crawler-module]] |
