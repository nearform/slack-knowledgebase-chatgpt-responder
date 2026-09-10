# AGENTS.md — crawler

Scoped context for `packages/crawler`. Read the root `AGENTS.md` first.

## Purpose

Fetches every Notion page the integration can see, flattens each page's block tree to
plain text, and writes the result as `scraped.csv` to a GCS bucket. Runs as a Cloud Run
job (`crawler-job`) on a Cloud Scheduler trigger.

## Layout

| File | Role |
|---|---|
| `src/index.js` | Entry point: calls `validateEnv()`, then dynamically imports and calls `crawl()`. |
| `src/env.js` | `requiredEnvironmentVariables` and `validateEnv()`, which throws naming every missing variable. |
| `src/crawl.js` | Orchestrates fetch, CSV, write, upload. Exits `1` on failure. |
| `src/notion.js` | Notion search pagination and recursive block-content extraction. |
| `src/utils.js` | `upload()` and `createCsv()`; `upload` copies to `.cache/` when local. |
| `src/csv.js` | `generateCsv()`, a thin `json2csv` wrapper. |

## Commands

```bash
make crawl                      # from the repo root, IS_LOCAL_ENVIRONMENT=true
npm test --workspace=crawler
npm run lint --workspace=crawler
```

## Environment

`NOTION_TOKEN`, `GCP_STORAGE_BUCKET_NAME`, `GCP_STORAGE_SCRAPED_FILE_NAME`, and
`IS_LOCAL_ENVIRONMENT` for local runs.

The first three are required: `src/index.js` calls `validateEnv()` before anything else,
so a missing, empty or whitespace-only value fails the run at startup with every missing
name in one error rather than part way through a crawl. `IS_LOCAL_ENVIRONMENT` is not
validated. The dynamic import of `crawl.js` is what keeps that check ahead of the Notion
client, which `notion.js` constructs as it loads: `test/startupValidation.test.js` pins
the ordering, so do not turn it back into a static import.

## Notes for changes

- Notion is rate limited. `getRecursiveBlockContent` retries a failed children fetch up to
  three times and sleeps 500ms before descending into a child; `pMap` caps page fetches at
  concurrency 3. Do not raise these without a reason.
- Pages whose extracted `text` is empty are dropped before the CSV is written.
- The CSV columns (`index`, `title`, `text`) are the contract with
  `embeddings-creation`. Changing them is a cross-package change: ask first.
- `src/csv.js` duplicates `createCsv` from `src/utils.js` and is currently unreferenced.

## Spec

`docs/crawler.md`.
