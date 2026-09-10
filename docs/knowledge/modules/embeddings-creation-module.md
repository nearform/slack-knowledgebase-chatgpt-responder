---
title: Embeddings creation module
type: module
tags: [openai, embeddings, cloud-function, cloudevent]
source_paths:
  - packages/embeddings-creation/src/create-embeddings.js
  - packages/embeddings-creation/src/env.js
  - packages/embeddings-creation/src/index.js
  - packages/embeddings-creation/src/utils.js
source_commit: c4bc5ac
created: 2026-09-09
updated: 2026-09-10
---

# Embeddings creation module

A single CloudEvent handler, `create_embeddings`, that turns `scraped.csv` into
`embeddings.csv`. Contract and acceptance criteria:
[`../../embeddings-creation.md`](../../embeddings-creation.md).

## The whole module is one function

`createEmbeddings(event)` does five things in sequence: guard the event, download and
parse, token-count and chunk, embed with retry, write and upload. There is no layering
because there is nothing to layer.

## Startup validation before the client

`src/index.js` calls `validateEnv()` from `src/env.js`, then dynamically imports
`src/create-embeddings.js` and registers the handler. The dynamic import is what keeps the
OpenAI client, built at that module's top level, from being constructed before the check
runs. `GCP_STORAGE_BUCKET_NAME` is deliberately not required here: the bucket comes off
the CloudEvent. See [[external-integrations]].

## The self-trigger guard

The handler's first act is to compare the event's object name against
`GCP_STORAGE_SCRAPED_FILE_NAME` and return early if it differs
(`packages/embeddings-creation/src/create-embeddings.js:60`). This is the load-bearing
line in the module: the function writes to the same bucket that triggers it, so without
the guard, writing `embeddings.csv` would re-trigger the function forever. See
[[pipeline-data-flow]].

## Why 2GiB

Every record, every chunk and every 1536-dimension vector is held in memory at once, then
serialised to CSV in one go. The deploy sets `--memory=2GiB` for exactly this. The design
does not stream, and corpus growth is bounded by that number rather than by anything else.

## What it decides

- **Chunking** — [[chunking-strategy]], including a real defect: the trailing chunk of an
  over-long record is never flushed.
- **The embedding model** — `text-embedding-ada-002`, a module constant. It must match
  what [[slack-bot-module]] queries with, or [[cosine-distance-ranking]] compares vectors
  from different spaces and the results are meaningless.
- **Concurrency and retry** — [[resilience-and-rate-limiting]].

## Failure behaviour

A chunk that cannot be embedded after retries logs its first 20 characters and rethrows,
which aborts the whole run. There is no partial write: either the complete
`embeddings.csv` is uploaded or nothing is. That is a reasonable choice, since a partial
corpus would silently degrade every answer.

Part of [[project-overview]]. Produces [[content-chunk]] rows per
[[embeddings-csv-schema]].
