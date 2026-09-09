---
title: Content chunk
type: domain
tags: [ubiquitous-language, embeddings, retrieval-unit]
source_paths:
  - packages/embeddings-creation/src/create-embeddings.js
  - packages/slack-bot/src/getAnswer.js
source_commit: c4bc5ac
created: 2026-09-09
updated: 2026-09-09
---

# Content chunk

**The unit of retrieval.** Everything the bot can say is assembled from chunks, so this is
the most important noun in the domain.

A chunk is one row of `embeddings.csv`:

| Field | Meaning |
|---|---|
| `index` | position in the generated list, not a stable identifier |
| `text` | the prose the model will read |
| `n_tokens` | its token count, used by [[context-token-budget]] |
| `embeddings` | the 1536-float vector, used by [[cosine-distance-ranking]] |

Full contract: [[embeddings-csv-schema]].

## What a chunk is not

- **Not a page.** A short page is one chunk; a long one is several. See
  [[chunking-strategy]].
- **Not traceable to its source.** A chunk carries no page id, no title, no URL. Once
  chunked, the link back to the Notion page is gone. This is why the bot cannot cite its
  sources, and it is a structural limit rather than a prompt choice: even if
  [[prompt-contract]] permitted citations, the data to cite with does not exist.
- **Not stably identified.** `index` is assigned per generation run, so the same text can
  have a different index after the next crawl. Nothing persists across runs, and nothing
  needs to.

## Lifecycle

Created wholesale by [[embeddings-creation-module]] on every run: chunks are never updated
in place, only replaced en masse. Loaded into memory by [[slack-bot-module]] and replaced
wholesale again on refresh ([[embedding-lifecycle-and-warm-start]]).

The `@TODO` at `packages/slack-bot/src/getAnswer.js:28` notes the in-memory
representation deserves a better shape for access and manipulation. It is currently a
plain array scanned linearly per question.
