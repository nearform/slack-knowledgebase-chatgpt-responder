# Spec: Slack bot

## Overview

The user-facing component: a Slack Bolt app, deployed as the `slackbot` Cloud Run function,
that answers direct messages from the embedded knowledge base, transcribes audio questions
before answering them, and summarises links and files on request.

## Behavior & rules

### Answering

- `getAnswer()` embeds the question with `text-embedding-ada-002`, ranks every stored chunk
  by cosine distance, and assembles the closest chunks into a context
  (`createContext`, `packages/slack-bot/src/getAnswer.js:97`, called by `getAnswer`).
- Context assembly adds chunks in ascending distance order while
  `n_tokens + 4` per chunk keeps the running total within the budget, and stops at the
  first chunk that would exceed it (`getAnswer.js:124`).
- The budget is `MAX_CONTEXT_TOKENS` from the environment, defaulting to 4000. Values that
  do not floor to a positive integer fall back to the default. `parsePositiveTokenCount`
  floors *before* the guard (`getAnswer.js:13`), so `0.9` floors to zero and is rejected,
  whereas `2500.9` floors to `2500` and is accepted.
- An explicit `maxLength` argument overrides the environment, because the environment is
  only read as the parameter's default value (`packages/slack-bot/src/getAnswer.js:146`).
- If a non-empty data set yields an empty context, a warning is logged and the call still
  proceeds (`getAnswer.js:167`).
- The completion uses `gpt-4.1` at `temperature: 0` with a prompt that confines the model
  to `<CONTEXT>`, forbids other sources, forbids mentioning the source, and passes the
  user's Slack locale (default `en-IE`). The prompt array is built at
  `packages/slack-bot/src/getAnswer.js:172`, the completion call at
  `packages/slack-bot/src/getAnswer.js:209`, and the `gpt-4.1` default at
  `packages/slack-bot/src/getAnswer.js:144`.

### Embeddings lifecycle

- `initialize()` memoises a single in-flight load promise and clears it on failure, so a
  failed load rejects its callers rather than hanging and the next caller retries
  (`getAnswer.js:39`).
- The module starts a load at import time and deliberately swallows that rejection, so the
  first question does not pay the load cost (`getAnswer.js:222`).
- Outside a local environment, a successful load subscribes to
  `GCP_EMBEDDING_SUBSCRIPTION` and reloads the data set on an `OBJECT_FINALIZE` message for
  the embeddings object, acking first (`getAnswer.js:72`).
- The download target is `/tmp/embeddings-<pid>.csv`, per process, so concurrent processes
  never share a file (`getAnswer.js:26`).

### Slack surface

- Bolt uses `ExpressReceiver`, so Slack requests to `/slack/events` are verified against
  `SLACK_SIGNING_SECRET` (`packages/slack-bot/src/bot.js:10`).
- `GET /healthz` is mounted on the Express app **outside** Bolt's route, awaits
  `initialize()`, and answers 200 or 503. It is used as the Cloud Run startup probe so the
  embeddings load gets full CPU (`bot.js:26`).
- On a `message` event the bot ignores `bot_message` subtypes, adds a `thumbsup` reaction,
  looks up the user for their locale, and posts an acknowledgement before answering
  (`bot.js:41`).
- If the message carries a file, the bot transcribes it with `whisper-1` and answers the
  transcript, echoing it back to the thread; a transcription failure posts a fixed error
  message instead (`bot.js:72`, `packages/slack-bot/src/utils.js:76`).
- The `summarize` shortcut summarises each file attached to the message and each link in
  its rich-text blocks, replying ephemerally per item with `gpt-4.1`
  (`packages/slack-bot/src/summarize.js:20`).

## Acceptance criteria

- Given a question and a loaded data set, when `getAnswer()` runs, then the question is
  embedded with `text-embedding-ada-002` and the chat completion is called once with the
  exact prompt message sequence, `temperature: 0` and `model: 'gpt-4.1'` (guarded:
  `getAnswer > returns expected answer`).
- Given chunks of 1000 tokens each and no `MAX_CONTEXT_TOKENS`, when `getAnswer()` runs,
  then exactly the three nearest chunks form the context (guarded:
  `getAnswer context budget > defaults to a 4000 token budget`).
- Given `MAX_CONTEXT_TOKENS=2500`, when `getAnswer()` runs, then only the two nearest
  chunks form the context (guarded:
  `getAnswer context budget > honours a valid MAX_CONTEXT_TOKENS override`).
- Given no environment budget and an explicit `maxLength`, when `getAnswer()` runs, then
  `maxLength` is used in place of the 4000 token default (guarded:
  `getAnswer context budget > lets an explicit maxLength argument win`, which deletes
  `MAX_CONTEXT_TOKENS` before calling).
- Given both a valid `MAX_CONTEXT_TOKENS` and an explicit `maxLength`, when `getAnswer()`
  runs, then `maxLength` wins (unguarded: no test sets both, so this precedence could
  invert without failing the suite).
- Given `MAX_CONTEXT_TOKENS` set to any of `''`, `'   '`, `'lots'`, `'0'`, `'-4000'`,
  `'4000ish'`, `'0.5'` or `'0.9'`, when `getAnswer()` runs, then the 4000 token default is
  used (guarded: the eight
  `getAnswer context budget > falls back to 4000 tokens when MAX_CONTEXT_TOKENS is …`
  cases).
- Given an embeddings download that throws, when `getAnswer()` is called, then the call
  rejects with that error, and a subsequent call after the failure clears succeeds
  (guarded: `getAnswer initialization > rejects when the embeddings fail to load, then
  loads on a retry`).
- Given a non-empty data set and a budget too small for any chunk, when `getAnswer()` runs,
  then it logs `Empty context assembled from N chunks with a budget of M tokens` (guarded:
  `getAnswer initialization > warns when a non empty data set produces an empty context`).
- Given a context is assembled, when `getAnswer()` runs, then no warning is logged
  (guarded: `getAnswer initialization > does not warn when a context is assembled`).
- Given a query embedding and stored embeddings, when `distancesFromEmbeddings()` runs,
  then it returns `1 - cosineSimilarity` per index, matching the original Python
  implementation to three decimal places (guarded: `distancesFromEmbeddings`).
- Given a non-local environment, when `download()` runs, then the named bucket file is
  downloaded to the caller's destination, not to the bucket file name (guarded:
  `download > downloads the bucket file to the destination it was given`).
- Given `initialize()` resolves without assigning a data set and none was passed, when
  `getAnswer()` runs, then it throws `No data frame provided` (unguarded). Note this is
  **not** the normal load-failure path: `getAnswer` awaits `initialize()` first, which
  rethrows, so a failed download surfaces that error rather than this guard. The guard is
  only reachable if a load resolves while leaving `defaultDataSet` unset.
- Given `GET /healthz`, when the embeddings are loaded, then it responds 200 `ok`, and 503
  `embeddings are not loaded` when the load fails (unguarded).
- Given a `message` event with subtype `bot_message`, when the handler runs, then it
  returns without replying (unguarded).
- Given a message with an audio file, when the handler runs, then the file is transcribed
  and the transcript is used as the question (unguarded).
- Given a transcription failure, when the handler runs, then the fixed error message is
  posted instead of an answer (unguarded).
- Given the `summarize` shortcut on a message with links or files, when it is invoked, then
  one ephemeral summary is posted per link and per file (unguarded).
- Given an `OBJECT_FINALIZE` Pub/Sub message for the embeddings object, when it arrives,
  then it is acked and the data set is reloaded (unguarded).

## Non-goals & boundaries

- Does not crawl Notion or create embeddings. See [crawler](./crawler.md) and
  [embeddings-creation](./embeddings-creation.md).
- Does not hold conversation history: each question is answered independently. The
  `@TODO` at `getAnswer.js:200` marks this as a known gap.
- Does not use Slack Socket Mode: HTTP only, because it deploys as a function.
- Does not persist application state. The embeddings data set is in-memory and rebuilt on
  restart. Two files are written to disk as a side effect: the embeddings cache at
  `/tmp/embeddings-<pid>.csv`, and, for each transcribed attachment, `./<file id>.mp4` in
  the working directory, which `downloadAudio` never removes
  (`packages/slack-bot/src/utils.js:52`).
- Does not authenticate `/healthz`, by design.

## Inputs & outputs

- **In:** Slack events and shortcuts over HTTP on `/slack/events`; Cloud Run startup probe
  on `/healthz`; the embeddings CSV from the bucket; Pub/Sub embedding-update messages.
- **Out:** Slack messages, threaded replies, ephemeral summaries and reactions; OpenAI
  embeddings, chat-completion, responses and audio-transcription calls.

## Data & state

- Embeddings row: [embeddings-creation](./embeddings-creation.md) writes a named
  `index,text,n_tokens,embeddings` header, and `csv2json` preserves those keys, so parsed
  rows carry `index`. The inline type at `packages/slack-bot/src/getAnswer.js:29` instead
  declares an empty-string first key, which matches the test fixtures rather than the
  produced file. The bot reads neither key, so the mismatch is latent, but the JSDoc and
  fixtures are the stale side, not the producer.
- In-memory `defaultDataSet` plus the memoised `initializationPromise`
  (`getAnswer.js:30`, `:32`) are the only mutable state.
- Local cache file `/tmp/embeddings-<pid>.csv`.
- Config: `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`, `OPENAI_API_KEY`, `GCP_PROJECT_ID`,
  `GCP_STORAGE_BUCKET_NAME`, `GCP_STORAGE_EMBEDDING_FILE_NAME`,
  `GCP_EMBEDDING_SUBSCRIPTION`, `MAX_CONTEXT_TOKENS`, `IS_LOCAL_ENVIRONMENT`.
- Slack OAuth scopes and the `message.im` bot event subscription are declared in `slack_manifest.yaml`. The `summarize` shortcut is registered in code at `packages/slack-bot/src/summarize.js:20`, not in the manifest.

## Dependencies & interactions

- **Called by:** Slack (events and shortcuts), the Cloud Run startup probe, Pub/Sub.
- **Calls:** OpenAI (embeddings, chat completions, responses, audio transcriptions), Google
  Cloud Storage, Google Cloud Pub/Sub, the Slack Web API.
- **Upstream:** [embeddings-creation](./embeddings-creation.md) owns the
  `index,text,n_tokens,embeddings` contract this component reads.

## Key flows

1. **Answer.** Message event → ignore bot messages → react and acknowledge → transcribe if
   a file is attached → `getAnswer()` → post the answer, or the fixed error message if
   anything threw.
2. **Context assembly.** Embed the question → cosine distances over the data set → sort
   ascending → take chunks until the token budget is spent → build the prompt → complete.
3. **Startup.** Import kicks off the embeddings load → the startup probe on `/healthz`
   awaits it → once loaded, subscribe to embedding updates (non-local only).
4. **Refresh.** `OBJECT_FINALIZE` for the embeddings object → ack → reload the data set.
5. **Summarise.** Shortcut → for each attached file, fetch and base64 it, then summarise;
   for each link in the message blocks, summarise with web search → ephemeral reply each.

## Tests & verification

Tests live in `packages/slack-bot/test/` (fixtures in `test/mocks/`) and run with
`npm test --workspace=slack-bot`. The workspace reports 19 passing tests as of 2026-09-09. Seventeen of them live in the five test files below; node's default glob also executes the two fixture modules in `test/mocks/`, which contain no tests. The test files are
`packages/slack-bot/test/getAnswer.test.js`, `packages/slack-bot/test/getAnswerContextBudget.test.js`, `packages/slack-bot/test/getAnswerInitialization.test.js`,
`packages/slack-bot/test/distancesFromEmbeddings.test.js` and `packages/slack-bot/test/download.test.js`.

Coverage is concentrated on `packages/slack-bot/src/getAnswer.js` and `packages/slack-bot/src/utils.js`. `packages/slack-bot/src/bot.js` (the message handler,
`/healthz`, transcription wiring) and `packages/slack-bot/src/summarize.js` have no tests, and neither does the
Pub/Sub refresh path. Note that `packages/slack-bot/test/download.test.js` must clear `IS_LOCAL_ENVIRONMENT` and
live in its own file, because `packages/slack-bot/src/utils.js` reads that variable at import time and a module
specifier can only be mocked once per process.

## Related code

- `packages/slack-bot/src/getAnswer.js`
- `packages/slack-bot/src/bot.js`
- `packages/slack-bot/src/summarize.js`
- `packages/slack-bot/src/utils.js`
- `packages/slack-bot/src/index.js`, `packages/slack-bot/src/dev.js`
