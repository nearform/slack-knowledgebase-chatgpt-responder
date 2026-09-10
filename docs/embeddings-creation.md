# Spec: Embeddings creation

## Overview

A CloudEvent-triggered Google Cloud Function that turns the crawler's `scraped.csv` into
`embeddings.csv`: it chunks each page's text to a token ceiling, embeds every chunk with
OpenAI, and writes the vectors back to the same bucket for the Slack bot to consume.

## Behavior & rules

- Registered as the `create_embeddings` CloudEvent handler
  (`packages/embeddings-creation/src/index.js:11`); deployed as the `embedding-creation`
  Cloud Run function.
- The handler returns early, logging a skip, unless the event's object name equals
  `GCP_STORAGE_SCRAPED_FILE_NAME` (`packages/embeddings-creation/src/create-embeddings.js:60`).
  This is what stops it re-triggering on its own output.
- Records with no `text` are dropped; each surviving record is token-counted with the
  `cl100k_base` encoding (`create-embeddings.js:74`).
- A record longer than `MAX_TOKENS` (500) is split by `splitIntoMany`, which breaks on
  `'. '` and accumulates sentences until the budget is reached; a single sentence longer
  than `MAX_TOKENS` is discarded (`packages/embeddings-creation/src/create-embeddings.js:19`).
- A chunk is only pushed when the *next* sentence would exceed the budget, so the final
  accumulated chunk of an over-long record is never flushed and its trailing text is
  dropped (`packages/embeddings-creation/src/create-embeddings.js:34`). This is the code
  as it stands, not a documented intent.
- Each chunk is embedded with `text-embedding-ada-002` through `exponential-backoff`
  (5 attempts, 5s max delay), at `p-map` concurrency 10 (`create-embeddings.js:88`, `:114`).
- A failed embedding logs the first 20 characters of the chunk and rethrows, which aborts
  the whole run (`create-embeddings.js:107`).
- The result is written to `GCP_STORAGE_EMBEDDING_FILE_NAME` and uploaded to the same
  bucket the event came from (`create-embeddings.js:119`).
- The entry point validates the environment before the handler is registered.
  `packages/embeddings-creation/src/index.js` loads dotenv, calls `validateEnv()` from
  `packages/embeddings-creation/src/env.js`, and only then dynamically imports
  `create-embeddings.js` to register it as the CloudEvent handler. `validateEnv` requires
  `OPENAI_API_KEY`, `GCP_STORAGE_SCRAPED_FILE_NAME` and `GCP_STORAGE_EMBEDDING_FILE_NAME`,
  treats absent, empty and whitespace-only values alike, and throws a single error naming
  every missing variable without including any value. `GCP_STORAGE_BUCKET_NAME` is
  deliberately not required: the bucket comes off the CloudEvent
  (`packages/embeddings-creation/src/create-embeddings.js:57`). The dynamic import is what
  keeps the OpenAI client, built at that module's top level, from being constructed before
  the check runs.

## Acceptance criteria

- Given a finalize event for the scraped file, when the handler runs, then it downloads
  that object from the event's bucket to the local scraped file name (guarded:
  `embeddings creation` asserts `download(bucket, scrapedFileName, scrapedFileName)`).
- Given a scraped CSV with one short record, when the handler runs, then exactly one
  embedding request is made and the output CSV has the header
  `index,text,n_tokens,embeddings` with the token count and vector for that record
  (guarded: `embeddings creation`).
- Given a completed run, when the output is written, then `upload()` is called once with
  `(event bucket, GCP_STORAGE_EMBEDDING_FILE_NAME)` (guarded: `embeddings creation`).
- Given an event whose object name is not `GCP_STORAGE_SCRAPED_FILE_NAME`, when the handler
  runs, then it logs a skip and returns without downloading or embedding (unguarded).
- Given a record over 500 tokens, when the handler runs, then **all** of its text should
  be split into chunks each within the 500 token budget (unguarded). **The current
  implementation violates this**: `splitIntoMany` pushes a chunk only when the next
  sentence would exceed the budget, so the final accumulated chunk is never flushed and
  the record's tail is lost, and where the record holds no `'. '` boundary at all it loses
  everything (see the next criterion). Treat the criterion as the invariant to restore,
  not the behaviour to preserve.
- Given a sentence longer than 500 tokens, when chunking runs, then that sentence is
  dropped (unguarded). Where such a sentence arrives with an empty accumulator the push at
  `packages/embeddings-creation/src/create-embeddings.js:35` precedes the size check, so a
  `"."` chunk is emitted in its place and embedded like any other. **For a record with no
  `'. '` boundary at all, which is what `packages/crawler/src/notion.js:65` produces for a
  bullet- or heading-heavy Notion page, that `"."` is the only chunk**: `splitIntoMany`
  returns exactly `["."]` and the whole record's text is lost. Treat the drop as intended
  and the `"."` as a defect to remove.
- Given a transient OpenAI failure, when a chunk is embedded, then the call is made up to
  5 times in total (4 retries) with a 5s maximum delay before the run fails (unguarded).
- Given an environment where `OPENAI_API_KEY`, `GCP_STORAGE_SCRAPED_FILE_NAME` or
  `GCP_STORAGE_EMBEDDING_FILE_NAME` is absent, empty or whitespace-only, when
  `validateEnv()` runs, then it throws one error naming every missing variable and no
  variable's value (guarded: the `embeddings-creation validateEnv` suite).
- Given only `GCP_STORAGE_BUCKET_NAME` is absent, when `validateEnv()` runs, then it does
  not throw, because the bucket arrives on the CloudEvent (guarded:
  `embeddings-creation validateEnv > does not require a bucket name, which arrives on the
  CloudEvent`).

## Non-goals & boundaries

- Does not fetch content from Notion. That is [crawler](./crawler.md).
- Does not answer questions or rank chunks; similarity search belongs to
  [slack-bot](./slack-bot.md).
- Does not incrementally update embeddings: every run re-embeds the whole corpus.
- Does not create the bucket, the Pub/Sub topic, or the notification. `.github/workflows/deploy-step.yml`
  provisions the bucket and the subscription, but **nothing creates the topic**, and its
  notification step is mis-guarded so it never runs. Both are manual prerequisites today:
  see the caveats in `docs/knowledge/sources/deploy-step-commands.md`.

## Inputs & outputs

- **In:** a `google.cloud.storage.object.v1.finalized` CloudEvent carrying `data.bucket`
  and `data.name`; the scraped CSV object itself; the OpenAI embeddings API.
- **Out:** `embeddings.csv` uploaded to the event's bucket. That upload finalizes an
  object, which notifies the Slack bot's Pub/Sub subscription.

## Data & state

- Input CSV columns `index,title,text`, produced by [crawler](./crawler.md).
- Output row: `{ index, text, n_tokens, embeddings }` built at
  `packages/embeddings-creation/src/create-embeddings.js:100`. `embeddings` is the raw
  vector array, serialised by `json-2-csv`.
- Module constants: `EMBEDDING_MODEL = 'text-embedding-ada-002'`
  (`packages/embeddings-creation/src/create-embeddings.js:8`) and `MAX_TOKENS = 500`
  (`packages/embeddings-creation/src/create-embeddings.js:11`).
- Config: `OPENAI_API_KEY`, `GCP_STORAGE_SCRAPED_FILE_NAME`,
  `GCP_STORAGE_EMBEDDING_FILE_NAME`, `IS_LOCAL_ENVIRONMENT`. The first three are required,
  and validated at startup by `packages/embeddings-creation/src/env.js`.
- The whole corpus is held in memory during a run, which is why the function is deployed
  with 2GiB.

## Dependencies & interactions

- **Called by:** Cloud Storage object-finalize events for the crawler's output.
- **Calls:** Google Cloud Storage (`download`, `upload`), OpenAI embeddings API.
- **Upstream:** [crawler](./crawler.md) supplies `index,title,text`.
- **Downstream:** [slack-bot](./slack-bot.md) consumes `index,text,n_tokens,embeddings`
  and must query with the same embedding model.

## Key flows

1. The entry point validates the environment, then registers the handler.
2. A finalize event arrives; the object name is checked against the scraped file name.
3. The object is downloaded and parsed; empty-text records are dropped and each record is
   token counted.
4. Over-long records are chunked; every chunk is embedded with retry at concurrency 10.
5. The rows are serialised to CSV, written locally, and uploaded to the bucket.

## Tests & verification

Tests live in `packages/embeddings-creation/test/` and run with
`npm test --workspace=embeddings-creation`; the script supplies the two `GCP_STORAGE_*`
names via `cross-env`. Seven tests, all passing as of 2026-09-10: `embeddings creation`
and the six cases in the `embeddings-creation validateEnv` suite.

`embeddings creation` covers the happy path end to end with mocked storage and OpenAI. The
skip-on-wrong-object-name branch, `splitIntoMany`, and the backoff *retry* branch are uncovered. `backOff` itself runs on
the happy path, so it is the retry, not the wrapper, that is unexercised.

## Related code

- `packages/embeddings-creation/src/create-embeddings.js`
- `packages/embeddings-creation/src/env.js`
- `packages/embeddings-creation/src/index.js`
- `packages/embeddings-creation/src/utils.js`
