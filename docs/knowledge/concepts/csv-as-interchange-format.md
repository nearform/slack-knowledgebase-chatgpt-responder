---
title: CSV as interchange format
type: concept
tags: [data-contract, csv, coupling]
source_paths:
  - packages/crawler/src/utils.js
  - packages/embeddings-creation/src/create-embeddings.js
  - packages/slack-bot/src/getAnswer.js
source_commit: c4bc5ac
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
- **A quirk in the header.** The bot's parsed rows carry an empty-string key `''` for the
  index column, visible in the type annotation at
  `packages/slack-bot/src/getAnswer.js:29` and in the test fixtures, which begin
  `,text,n_tokens,embeddings`. The embedding stage writes `index` as a named column, but
  the round trip through `json-2-csv` leaves the bot reading it unnamed. The bot never uses
  it, which is why the discrepancy has not mattered.
- **No schema evolution story.** Adding a column means coordinating a deploy across two
  services that communicate only through the file.

Consumed by [[cosine-distance-ranking]] as [[content-chunk]] rows.
