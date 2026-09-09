# AGENTS.md — slack-bot

Scoped context for `packages/slack-bot`. Read the root `AGENTS.md` first.

## Purpose

The user-facing Bolt app, deployed as the `slackbot` Cloud Run function. It answers direct
messages from the embedded knowledge base, transcribes audio attachments before answering,
and offers a `summarize` message shortcut for links and files.

## Layout

| File | Role |
|---|---|
| `src/index.js` | Exports `slackBot`, the Express app the function serves. |
| `src/bot.js` | Bolt app, `ExpressReceiver`, the `message` handler, `/healthz`. |
| `src/getAnswer.js` | Embeddings load/refresh, context assembly, chat completion. |
| `src/summarize.js` | The `summarize` shortcut for links and file attachments. |
| `src/utils.js` | `download`, `parseCsv`, `distancesFromEmbeddings`, audio transcription. |
| `src/dev.js` | Local Bolt server (`npm run dev`). |

## Commands

```bash
make bot-start                  # functions-framework on :3003
make bot-expose                 # ngrok, for Slack's Request URL
npm test --workspace=slack-bot
npm run lint --workspace=slack-bot
```

## Environment

`SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`, `OPENAI_API_KEY`, `GCP_PROJECT_ID`,
`GCP_STORAGE_BUCKET_NAME`, `GCP_STORAGE_EMBEDDING_FILE_NAME`, `GCP_EMBEDDING_SUBSCRIPTION`,
optional `MAX_CONTEXT_TOKENS` (default 4000), and `IS_LOCAL_ENVIRONMENT` for local runs.

## Notes for changes

- **Embeddings loading is the subtle part.** `initialize()` memoises a single in-flight
  promise and clears it on failure so the next caller retries; the module kicks off a load
  at import time and swallows that rejection deliberately. `/healthz` awaits `initialize()`
  and is used as the Cloud Run startup probe so the load gets full CPU. Preserve all three
  behaviours together.
- `/healthz` is registered on `expressReceiver.app`, outside Bolt's `/slack/events` mount,
  so no Slack signature check applies to it.
- In production the bot subscribes to `GCP_EMBEDDING_SUBSCRIPTION` and reloads the data set
  on an `OBJECT_FINALIZE` for the embeddings file. It acks first, then reloads.
- Context assembly sorts by cosine distance and adds chunks while
  `n_tokens + 4` keeps the running total within `maxLength`; it warns when a non-empty data
  set yields an empty context. `parsePositiveTokenCount` floors before the guard, so a
  fractional `MAX_CONTEXT_TOKENS` falls back to the default.
- The prompt in `getAnswer` constrains the model to `<CONTEXT>` only and forbids citing the
  source. Changing that wording changes the product: ask first.
- The local embeddings file is `/tmp/embeddings-<pid>.csv`, per process, so concurrent
  tests never share it.

## Spec

`docs/slack-bot.md`.
