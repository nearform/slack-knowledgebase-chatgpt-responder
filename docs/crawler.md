# Spec: Crawler

## Overview

Pulls every Notion page the integration can reach, flattens each page's block tree into a
single line of plain text, and publishes the result as a CSV to a Google Cloud Storage
bucket. It is the first stage of the pipeline and the only component that talks to Notion.

## Behavior & rules

- Pages are discovered with the Notion `search` API filtered to `object: page`, paginated
  10 at a time, following `next_cursor` until `has_more` is false
  (`packages/crawler/src/notion.js:23`).
- A page's title is taken from the `Name` property, falling back to the `title` property,
  and is `null` when neither exists (`packages/crawler/src/notion.js:45`).
- Page content is gathered by recursively listing block children and collecting every
  block type's `rich_text[].plain_text` (`packages/crawler/src/notion.js:104`).
- Newlines are stripped from the assembled text; blocks are joined with a single space
  (`packages/crawler/src/notion.js:65`).
- Pages whose assembled text is empty are dropped (`packages/crawler/src/notion.js:71`).
- Notion is rate limited, so page fetches run at `p-map` concurrency 3, a failed children
  listing is retried up to three times, and descending into a block's children sleeps
  500ms first (`packages/crawler/src/notion.js:69`, `:84`, `:116`).
- Any failure in `crawl()` is logged and the process exits with code 1
  (`packages/crawler/src/crawl.js:17`).

## Acceptance criteria

- Given a paginated Notion search, when `getPages()` runs, then it calls `search` once per
  page passing the previous response's `next_cursor` as `start_cursor` and `page_size: 10`
  (guarded: `notion > getPages works correctly with pagination`).
- Given pages where one yields no text, when `fetchData()` runs, then only pages with text
  are returned, each as `{ index, title, text }` with the title resolved from the `Name`
  property (guarded by snapshot: `notion > fetchData returns correct parsed data`,
  `packages/crawler/test/notion.test.js.snapshot`).
- Given an array of page records, when `createCsv()` runs, then it produces a CSV with the
  header `index,title,text` (guarded: `createCsv works correctly`).
- Given a successful fetch, when `crawl()` runs, then the CSV is written to
  `GCP_STORAGE_SCRAPED_FILE_NAME` and `upload()` is called once with
  `(GCP_STORAGE_BUCKET_NAME, GCP_STORAGE_SCRAPED_FILE_NAME)` (guarded: `crawl`).
- Given `IS_LOCAL_ENVIRONMENT` is set, when `upload()` runs, then the file is copied into
  the repo's `.cache/` directory instead of a bucket (unguarded).
- Given any error during the crawl, when `crawl()` runs, then the error is logged and the
  process exits with code 1 (unguarded).
- Given a Notion children listing that fails, when content is gathered, then it is retried
  up to three times before that block's children are skipped (unguarded).

## Non-goals & boundaries

- Does not generate embeddings or call OpenAI. That is
  [embeddings-creation](./embeddings-creation.md).
- Does not read the bucket, subscribe to notifications, or talk to Slack.
- Does not filter or classify Notion content beyond dropping empty pages: whatever the
  integration can see is crawled.
- Does not schedule itself. Cloud Scheduler triggers the `crawler-job` Cloud Run job
  (`.github/workflows/deploy-step.yml`).

## Inputs & outputs

- **In:** the Notion API, authenticated with `NOTION_TOKEN`.
- **Out:** `scraped.csv` (named by `GCP_STORAGE_SCRAPED_FILE_NAME`) written locally then
  uploaded to `GCP_STORAGE_BUCKET_NAME`, or copied to `.cache/` when local.
- **Side effect:** the bucket write finalizes an object, which is what triggers
  embeddings-creation.

## Data & state

- Page record: `{ index: number, title: string | null, text: string }`, built in
  `packages/crawler/src/notion.js:62`.
- Output CSV columns `index,title,text`, produced by `createCsv`
  (`packages/crawler/src/utils.js:25`) and asserted in
  `packages/crawler/test/utils.test.js`.
- Config: `NOTION_TOKEN`, `GCP_STORAGE_BUCKET_NAME`, `GCP_STORAGE_SCRAPED_FILE_NAME`,
  `IS_LOCAL_ENVIRONMENT`.
- Holds no persistent state; the process is one-shot.

## Dependencies & interactions

- **Calls:** Notion API; Google Cloud Storage (`upload`).
- **Called by:** Cloud Scheduler (`crawl-schedule-job`) via the Cloud Run job.
- **Downstream:** [embeddings-creation](./embeddings-creation.md) consumes the
  `index,title,text` CSV. That column set is the contract between them.

## Key flows

1. `packages/crawler/src/index.js` calls `crawl()`.
2. `fetchData()` pages through Notion search, then fetches each page's block content at
   concurrency 3, dropping pages with no text.
3. `createCsv()` serialises the records; the CSV is written to the local file.
4. `upload()` copies to `.cache/` locally, or uploads to the bucket in production.

## Tests & verification

Tests live in `packages/crawler/test/` and run with `npm test --workspace=crawler`
(`node --test --experimental-test-module-mocks`). Four tests, all passing as of 2026-09-09:
`crawl`, `notion > fetchData returns correct parsed data` (snapshot),
`notion > getPages works correctly with pagination`, `createCsv works correctly`.

Not covered: the retry and 500ms-delay behavior in `getRecursiveBlockContent`, the
local-vs-bucket branch of `upload`, and the `process.exit(1)` error path.

## Related code

- `packages/crawler/src/crawl.js`
- `packages/crawler/src/notion.js`
- `packages/crawler/src/utils.js`
- `packages/crawler/src/csv.js` (duplicate of `createCsv`, currently unreferenced)
