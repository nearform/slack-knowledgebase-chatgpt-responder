---
title: Refresh the knowledge base
type: tour
tags: [reading-path, write-flow, operations]
source_paths:
  - packages/crawler/src/crawl.js
  - packages/embeddings-creation/src/create-embeddings.js
  - packages/slack-bot/src/getAnswer.js
source_commit: c4bc5ac
created: 2026-09-09
updated: 2026-09-09
---

# Refresh the knowledge base

Follow a Notion edit through to a changed answer. This is the write path, and it is
entirely asynchronous: **nobody is waiting on it and nothing reports success end to end.**

## 1. Someone edits Notion

No notification, no webhook. The change sits until the next crawl.
[[knowledge-base-content]].

## 2. Cloud Scheduler fires — `crawl-schedule-job`

Triggers the `crawler-job` Cloud Run job over HTTP.
[[gcp-deployment-topology]].

## 3. The crawl — `packages/crawler/src/crawl.js`

Discover every page the integration can see, flatten each block tree, drop empty pages,
write `scraped.csv`, upload it. Rate-limited throughout
([[resilience-and-rate-limiting]]) and **content-lossy by design**
([[crawler-module]]). Note a persistently failing block subtree is skipped silently, so
this step can lose content and still exit 0.

## 4. The bucket write becomes an event

`scraped.csv` finalizing triggers the `create_embeddings` CloudEvent handler.
[[pipeline-data-flow]].

## 5. Guard — `create-embeddings.js:60`

The handler checks the object name is the scraped file and returns early otherwise. Without
it, step 7's write would re-trigger this handler in a loop.

## 6. Chunk and embed

Drop empty records, token-count, split anything over 500 tokens
([[chunking-strategy]] — **note the trailing chunk is dropped here**), then embed every
chunk at concurrency 10 with backoff. Whole corpus in memory, hence 2GiB.
[[embeddings-creation-module]].

## 7. Write `embeddings.csv`

Uploaded to the same bucket. All or nothing: an exhausted retry aborts the run and nothing
is published.

## 8. Notification to Pub/Sub

The bucket notification on `OBJECT_FINALIZE` publishes to the embeddings topic.

## 9. The bot reloads — `getAnswer.js:75`

The running bot's subscription receives the message, **acks first**, checks the object id
and event type, and replaces `defaultDataSet` wholesale. No redeploy, no restart.
[[embedding-lifecycle-and-warm-start]].

This is the step most likely to fail invisibly. The reload has no `try`/`catch` and the
message is already acked, so a failure here ends the cascade silently and the bot keeps
answering from the previous corpus.

## 10. The next question sees new content

There is no cache to invalidate beyond that in-memory array.
[[content-chunk]].

## Operating notes

- **Total latency** is the scheduler interval plus crawl plus embed plus reload. A Notion
  edit is not visible for at least the time to the next scheduled crawl.
- **No end-to-end status.** Each stage logs to its own Cloud Run logs. Nothing correlates
  a crawl with the embedding run it triggered or the reload that followed, so answering
  "did my Notion edit land?" means reading three separate log streams in order.
- **To force a refresh**, trigger `crawler-job` (or the scheduler job) manually. The rest
  cascades.
- **To test the cascade locally**, use the `make` chain in
  [[local-environment-emulation]] — there are no events on a laptop.
