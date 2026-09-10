# AGENTS.md — embeddings-creation

Scoped context for `packages/embeddings-creation`. Read the root `AGENTS.md` first.

## Purpose

A CloudEvent-triggered Cloud Function (`create_embeddings`, deployed as
`embedding-creation`). When `scraped.csv` is finalized in the bucket it chunks the text to
at most 500 tokens, embeds each chunk with OpenAI, and writes `embeddings.csv` back to the
same bucket, which in turn notifies the Slack bot over Pub/Sub.

## Layout

| File | Role |
|---|---|
| `src/index.js` | Registers the `create_embeddings` CloudEvent handler. |
| `src/create-embeddings.js` | Filter, chunk, embed, write, upload. |
| `src/utils.js` | `download`, `upload`, `createCsv`, `parseCsv`; local mode uses `.cache/`. |

## Commands

```bash
make embeddings-start           # functions-framework on :3002
make embeddings                 # POST a synthetic storage.object.v1.finalized event
npm test --workspace=embeddings-creation
npm run lint --workspace=embeddings-creation
```

## Environment

`OPENAI_API_KEY`, `GCP_STORAGE_SCRAPED_FILE_NAME`, `GCP_STORAGE_EMBEDDING_FILE_NAME`, and
`IS_LOCAL_ENVIRONMENT` for local runs. The test script sets the two `GCP_STORAGE_*` names
itself via `cross-env`.

## Notes for changes

- The handler returns early unless the event's object name equals
  `GCP_STORAGE_SCRAPED_FILE_NAME`, so it does not re-trigger on its own output.
- `MAX_TOKENS` is 500 and `EMBEDDING_MODEL` is `text-embedding-ada-002`, both module
  constants. The embedding model must match the one the Slack bot queries with.
- `splitIntoMany` splits on `'. '` and drops any single sentence longer than `MAX_TOKENS`.
- OpenAI calls run at `pMap` concurrency 10 wrapped in `backOff` (5 attempts, 5s max
  delay). The function is deployed with 2GiB of memory because the whole corpus is held in
  memory.
- Output columns (`index`, `text`, `n_tokens`, `embeddings`) are the contract with the
  Slack bot.

## Spec

`docs/embeddings-creation.md`.
