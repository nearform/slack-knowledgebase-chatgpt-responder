---
title: Crawler module
type: module
tags: [notion, crawl, cloud-run-job]
source_paths:
  - packages/crawler/src/crawl.js
  - packages/crawler/src/notion.js
  - packages/crawler/src/utils.js
  - packages/crawler/src/csv.js
source_commit: c4bc5ac
created: 2026-09-09
updated: 2026-09-09
---

# Crawler module

The only component that talks to Notion (`@notionhq/client` appears in no other package).
It discovers pages, flattens each page's block tree to one line of text, and writes
`scraped.csv`. Contract and acceptance criteria: [`../../crawler.md`](../../crawler.md).

## Shape

`src/index.js` calls `crawl()`, which is a four-step orchestration with a single
`try`/`catch` that logs and `process.exit(1)`s. Everything interesting is in
`src/notion.js`.

## The two-phase Notion read

Notion's API does not give you a page's text in one call, so the crawl is two nested
traversals:

1. **Discovery** — `getPages()` pages through `notion.search()` filtered to
   `object: page`, ten at a time, following `next_cursor` until `has_more` is false.
2. **Content** — `getRecursiveBlockContent()` descends each page's block tree, collecting
   every block type's `rich_text[].plain_text`. It is recursive because Notion nests
   blocks arbitrarily.

The title comes from the `Name` property, falling back to `title`, and is `null` if
neither exists (`packages/crawler/src/notion.js:45`). Real Notion databases use `Name`;
loose pages use `title`. Both appear in the wild, hence the fallback.

## Flattening is lossy, deliberately

All block structure is discarded: types are ignored, newlines are stripped, and blocks are
joined with a single space. Headings, lists and code blocks all become the same
undifferentiated prose. That loss is what makes [[chunking-strategy]]'s sentence-splitting
the only available structure downstream.

Pages that flatten to empty text are dropped before the CSV is written, so an empty Notion
page does not become a useless [[content-chunk]].

## Rate limiting

Notion is the tightest external constraint in the repo. See
[[resilience-and-rate-limiting]] for the concurrency cap, the retry loop and the descend
delay.

## A loose end

`src/csv.js` exports `generateCsv`, a duplicate of `createCsv` in `src/utils.js`, and is
referenced by nothing. Harmless, but it is dead code.

Part of [[project-overview]]. Feeds [[embeddings-creation-module]] via
[[pipeline-data-flow]].
