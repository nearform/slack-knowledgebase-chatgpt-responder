---
title: Resilience and rate limiting
type: concept
tags: [retry, backoff, concurrency, reliability]
source_paths:
  - packages/crawler/src/notion.js
  - packages/embeddings-creation/src/create-embeddings.js
source_commit: c4bc5ac
created: 2026-09-09
updated: 2026-09-09
---

# Resilience and rate limiting

Two external APIs impose limits, and each is handled differently: the crawler by hand, the
embedding stage with a library.

## Crawler, hand-rolled

| Control | Value | Where |
|---|---|---|
| page fetch concurrency | 3 | `p-map` in `packages/crawler/src/notion.js:69` |
| children-list retry | up to 3 further attempts | `while (retryCount < 4)`, `:84` |
| delay before descending | 500ms | `:116` |

Notion is the tightest constraint in the repo, hence the conservative numbers. The retry
loop has a notable property: **if all attempts fail, `blocks` stays undefined and the
function returns `[]`.** A persistently failing block subtree is silently skipped, not
raised, so a crawl can quietly lose content and still report success. Nothing counts or
logs how much was skipped.

## Embedding stage, library-based

| Control | Value |
|---|---|
| attempts per chunk | 5 total (4 retries) via `exponential-backoff` |
| max delay | 5000ms |
| embed concurrency | 10 via `p-map` |

Concurrency 10 against OpenAI versus 3 against Notion reflects the relative generosity of
the two APIs. Unlike the crawler, an exhausted retry here **rethrows and aborts the whole
run** ([[embeddings-creation-module]]), so partial corpora never get published. That is the
stricter and better choice of the two.

## The bot has neither

There is no retry around the embedding or completion calls in
`packages/slack-bot/src/getAnswer.js`. A transient OpenAI failure surfaces to the user as
the fixed error message. Defensible for an interactive path where a user can just ask
again, but worth knowing it is a deliberate asymmetry and not an oversight in the batch
stages.

Both retry paths are untested.
