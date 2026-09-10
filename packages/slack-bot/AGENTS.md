# AGENTS.md — slack-bot

Scoped context for `packages/slack-bot`. Read the root `AGENTS.md` first.

## Purpose

The user-facing Bolt app, deployed as the `slackbot` Cloud Run function. It answers direct
messages from the embedded knowledge base, transcribes audio attachments before answering,
and offers a `summarize` message shortcut for links and files.

## Layout

| File | Role |
|---|---|
| `src/index.js` | Calls `validateEnv()`, then dynamically imports `bot.js` and exports `slackBot`, the Express app the function serves. |
| `src/env.js` | `requiredEnvironmentVariables`, `pubSubEnvironmentVariables` and `validateEnv()`, which throws naming every missing variable. |
| `src/bot.js` | Bolt app, `ExpressReceiver`, the `message` handler, `/healthz`. |
| `src/messageEvents.js` | Pure predicates deciding which `message` events and files the handler acts on. |
| `src/getAnswer.js` | Embeddings load/refresh, context assembly, chat completion. |
| `src/summarize.js` | The `summarize` shortcut for links and file attachments. |
| `src/utils.js` | `download`, `parseCsv`, `distancesFromEmbeddings`, `downloadAudio`, `transcribe`, `transcriptionText`. |
| `src/dev.js` | Local Bolt server (`npm run dev`); validates and imports `bot.js` the same way `src/index.js` does. |

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

`src/index.js` and `src/dev.js` both call `validateEnv()` before anything else, so a
missing, empty or whitespace-only value fails startup with every missing name in one
error instead of an opaque client-library error on the first Slack request. Always
required: `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`, `OPENAI_API_KEY`,
`GCP_STORAGE_BUCKET_NAME` and `GCP_STORAGE_EMBEDDING_FILE_NAME`. `GCP_PROJECT_ID` and
`GCP_EMBEDDING_SUBSCRIPTION` are required only when `IS_LOCAL_ENVIRONMENT` is falsy,
since they only build the Pub/Sub subscription name and the local environment skips that
path. `MAX_CONTEXT_TOKENS` is outside `validateEnv` on purpose (optional, with
`parsePositiveTokenCount` handling it), and `IS_LOCAL_ENVIRONMENT` is not itself
validated. The dynamic import of `bot.js` is what keeps the check ahead of the
`ExpressReceiver`, Bolt app and OpenAI client it builds as it loads:
`test/startupValidation.test.js` pins the ordering, so do not turn it back into a static
import.

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
  `MAX_CONTEXT_TOKENS` **below 1** (`0.9`) floors to zero and falls back to the default,
  while a fractional value of 1 or more (`2500.9`) is simply floored and accepted.
- The prompt in `getAnswer` constrains the model to `<CONTEXT>` only and forbids citing the
  source. Changing that wording changes the product: ask first.
- The local embeddings file is `/tmp/embeddings-<pid>.csv`, per process, so concurrent
  tests never share it.
- **`getAnswer` requires a question.** There is no default: a missing, empty,
  whitespace-only or non-string `question` throws `getAnswer requires a question` before
  any OpenAI call (`src/getAnswer.js:154`). Do not reintroduce a default parameter, and
  keep the guard ahead of `initialize()` so a spurious event costs nothing.
- **Event filtering lives in `src/messageEvents.js`, not the handler.** Six pure
  predicates, exported so they can be tested without constructing a Bolt app:
  `isPlainUserMessage` (a deny list of non-user subtypes, plus a `bot_id` or `hidden`
  rejection), `hasQuestionText`, `hasFileAttachment`, `isTranscribableFile`,
  `hasAttachments` and `carriesQuestion`. The subtype list is a **deny** list on purpose,
  so an unrecognised subtype is still answered rather than silently dropped. Add a
  predicate here rather than inlining a condition in `src/bot.js`.
- **Only audio is sent to Whisper.** `isTranscribableFile` requires an `audio/` mimetype
  or the `slack_audio` subtype **and** a non-empty `url_private_download`
  (`src/messageEvents.js:131`). Both halves matter: without the first, documents and
  screenshots were uploaded to OpenAI and a screen recording's soundtrack was answered
  instead of the typed question; without the second, `new URL(undefined)` threw on Slack
  Connect and restricted-file stubs.
- **The handler picks the first *transcribable* file, not the first file**
  (`src/bot.js:130`), so a document uploaded alongside a voice note does not hide the
  recording.
- **Four user-facing replies are not the generic error, deliberately**: unintelligible
  audio, an unreadable attachment, a share with no question, and the "I could not get
  anything from that attachment" notice sent when a question was typed alongside a file
  that failed (`src/bot.js:49-66`). Each exists because the generic "please try again"
  sent the user round a loop that could not help. Keep them distinct.
- **`downloadAudio` writes to `os.tmpdir()` with a `randomUUID()` suffix**
  (`src/utils.js:107`), rejects every failure (transport, mid-stream, write, timeout,
  non-2xx), and `transcribe` removes the scratch file in a `finally`
  (`src/utils.js:225-231`). Cloud Run's filesystem is memory on a `--min-instances=1`
  instance, so a leaked file per upload grows until the instance is OOM-killed.
- **Read the transcription through `transcriptionText`** (`src/utils.js:190`). It accepts
  either shape the SDK returns and trims, so the empty string means exactly "no words were
  heard" and callers can branch on it directly.

## Spec

`docs/slack-bot.md`.
