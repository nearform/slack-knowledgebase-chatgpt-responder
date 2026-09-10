---
title: CSV as interchange format
type: concept
tags: [data-contract, csv, coupling]
source_paths:
  - packages/crawler/src/utils.js
  - packages/embeddings-creation/src/create-embeddings.js
  - packages/slack-bot/src/getAnswer.js
source_commit: 633de22
created: 2026-09-09
updated: 2026-09-09
---

# CSV as interchange format

Both stage boundaries in [[pipeline-data-flow]] are CSV files in a bucket, serialised with
`json-2-csv` and parsed with `csv2json`. Column contracts: [[embeddings-csv-schema]].

## Why it works here

The data is genuinely tabular, both producers and consumers are Node, the files are
written and read whole, and a CSV in a bucket is trivially inspectable: you can download
`embeddings.csv` and open it. For a pipeline whose stages are decoupled by storage events,
a plain file is a good bus payload.

## What it costs

- **The contract is implicit.** Nothing validates the columns. If the crawler renamed
  `text`, the embedding stage would produce rows of `undefined` and the failure would
  surface as bad answers, not an error. The columns are the API, and they are enforced only
  by tests asserting literal CSV strings.
- **Vectors as strings.** A 1536-float embedding is stored as a bracketed string and
  re-parsed on load. That is verbose on disk and slow to parse for a whole corpus, and it
  is the reason the bot's startup cost is high enough to need
  [[embedding-lifecycle-and-warm-start]].
- **A stale type annotation, not a round-trip quirk.** The embedding stage writes a named
  `index` column and `csv2json` preserves it, so rows parsed from the real file carry an
  `index` key. But the bot's inline type at `packages/slack-bot/src/getAnswer.js:29`
  declares an empty-string first key, and its fixtures begin `,text,n_tokens,embeddings`
  to match. The JSDoc and the fixtures are the stale side; the producer is correct. The bot
  reads neither key, so nothing breaks, but a test fixture that does not match the file it
  stands in for is a trap for the next person who writes a test against it.
- **No schema evolution story.** Adding a column means coordinating a deploy across two
  services that communicate only through the file.

Consumed by [[cosine-distance-ranking]] as [[content-chunk]] rows.
