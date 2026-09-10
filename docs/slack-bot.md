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
  first chunk that would exceed it (`getAnswer.js:124-127`).
- The budget is `MAX_CONTEXT_TOKENS` from the environment, defaulting to 4000. Values that
  do not floor to a positive integer fall back to the default. `parsePositiveTokenCount`
  floors *before* the guard (`getAnswer.js:13`), so `0.9` floors to zero and is rejected,
  whereas `2500.9` floors to `2500` and is accepted.
- An explicit `maxLength` argument overrides the environment, because the environment is
  only read as the parameter's default value (`packages/slack-bot/src/getAnswer.js:146`).
- If a non-empty data set yields an empty context, a warning is logged and the call still
  proceeds (`getAnswer.js:173`).
- The completion uses `gpt-4.1` at `temperature: 0` with a prompt that confines the model
  to `<CONTEXT>`, forbids other sources, forbids mentioning the source, and passes the
  user's Slack locale (default `en-IE`). The prompt array is built at
  `packages/slack-bot/src/getAnswer.js:179`, the completion call at
  `packages/slack-bot/src/getAnswer.js:216`, and the `gpt-4.1` default at
  `packages/slack-bot/src/getAnswer.js:144`.
- `getAnswer()` requires a question and supplies no default. A `question` that is not a
  string, or is empty or whitespace only, throws `getAnswer requires a question`
  (`getAnswer.js:154`) before `initialize()` is awaited and before any OpenAI call, so a
  spurious event costs nothing and fails visibly instead of producing a plausible answer to
  a question nobody asked.

### Embeddings lifecycle

- `initialize()` memoises a single in-flight load promise and clears it on failure, so a
  failed load rejects its callers rather than hanging and the next caller retries
  (`getAnswer.js:39`).
- The module starts a load at import time and deliberately swallows that rejection, so the
  first question does not pay the load cost (`getAnswer.js:229`).
- Outside a local environment, a successful load subscribes to
  `GCP_EMBEDDING_SUBSCRIPTION` and reloads the data set on an `OBJECT_FINALIZE` message for
  the embeddings object, acking first (`getAnswer.js:72`).
- The download target is `/tmp/embeddings-<pid>.csv`, per process, so concurrent processes
  never share a file (`getAnswer.js:26`).

### Startup validation

- Both entry points validate the environment before `bot.js` is loaded.
  `packages/slack-bot/src/index.js` and `packages/slack-bot/src/dev.js` load dotenv, call
  `validateEnv()` from `packages/slack-bot/src/env.js`, and only then dynamically import
  `bot.js`. `validateEnv` always requires `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`,
  `OPENAI_API_KEY`, `GCP_STORAGE_BUCKET_NAME` and `GCP_STORAGE_EMBEDDING_FILE_NAME`, and
  additionally `GCP_PROJECT_ID` and `GCP_EMBEDDING_SUBSCRIPTION` when
  `IS_LOCAL_ENVIRONMENT` is falsy. It treats absent, empty and whitespace-only values
  alike, and throws a single error naming every missing variable without including any
  value.
- The two Pub/Sub variables are conditional because they exist only to build the
  subscription name (`getAnswer.js:85`), a path skipped in the local environment
  (`getAnswer.js:60`).
- The dynamic import is load-bearing: `bot.js` builds its `ExpressReceiver`, its Bolt
  `App` and its OpenAI client as it loads, and ESM evaluates an imported module's body
  before its importer's, so a static import would construct all three before the check
  ran.
- `MAX_CONTEXT_TOKENS` is outside this: it is optional with a default, and is handled by
  `parsePositiveTokenCount`.

### Slack surface

- Bolt uses `ExpressReceiver`, so Slack requests to `/slack/events` are verified against
  `SLACK_SIGNING_SECRET` (`packages/slack-bot/src/bot.js:16`).
- `GET /healthz` is mounted on the Express app **outside** Bolt's route, awaits
  `initialize()`, and answers 200 or 503. It is used as the Cloud Run startup probe so the
  embeddings load gets full CPU (`bot.js:32`).
- Which `message` events are acted on is decided by pure predicates in
  `packages/slack-bot/src/messageEvents.js`, not inline in the handler. Two guards run
  before anything visible happens (`bot.js:77`, `bot.js:83`), so an event the bot should
  not answer leaves no reaction and no reply at all:
  - `isPlainUserMessage` (`messageEvents.js:79`) rejects a **deny list** of non-user
    subtypes (`messageEvents.js:35-64`) and any event carrying `bot_id` or `hidden`. The
    list is a deny list on purpose: an unrecognised subtype is answered, as it was before
    the guard existed, because a wrong answer is visible and a dropped one looks like an
    outage. `file_share`, `thread_broadcast` and `me_message` are absent from it, so they
    are answered.
  - `carriesQuestion` (`messageEvents.js:176`) then requires typed text, a file, or
    message `attachments`, so an event with nothing a person is waiting on is dropped.
- Past those guards the bot adds a `thumbsup` reaction (`bot.js:106`) and looks up the user
  for their locale (`bot.js:115`).
- If any attached file is transcribable the bot transcribes it with `whisper-1`, posts the
  transcript back to the thread (`You asked: "..."`) and answers it (`bot.js:140`,
  `packages/slack-bot/src/utils.js:208`). `transcribe` reads its result through
  `transcriptionText` (`utils.js:190`), which accepts either the bare string
  `response_format: 'text'` resolves to or an object carrying `text`, and trims it, so the
  empty string means exactly "no words were heard".
- The file chosen is the first **transcribable** file, not the first file (`bot.js:130`), so
  a document uploaded alongside a voice note does not hide the recording.
  `isTranscribableFile` (`messageEvents.js:131`) requires an `audio/` mimetype or the
  `slack_audio` subtype **and** a non-empty `url_private_download`, so documents, images and
  videos are never sent to OpenAI and a file Slack served no download URL for does not throw.
- Four replies are deliberately not the generic error string (`bot.js:49-66`): audio that
  yielded no words, an unreadable attachment sent with nothing typed, a message shared with
  no question in it, and a notice that an attachment was no use when a question was typed
  alongside it. In the last case the typed text is answered.
- `downloadAudio` (`utils.js:99`) writes to `os.tmpdir()` with a `randomUUID()` suffix
  (`utils.js:107`), preserves the signed URL's query string (`utils.js:117`), rejects a
  non-2xx response rather than writing the error body to disk (`utils.js:125`), pipes with
  `stream.pipeline` so either side's failure is reported and both streams are destroyed
  (`utils.js:142`), and abandons a stalled download after 30s of inactivity
  (`utils.js:59`). Every failure rejects and removes the partial file; `transcribe` removes
  the scratch file in a `finally` (`utils.js:225-231`).
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
- Given a `question` that is omitted, `null`, empty, whitespace only or not a string, when
  `getAnswer()` is called, then it rejects with `getAnswer requires a question` and neither
  `embeddings.create` nor `chat.completions.create` is called (guarded: the five
  `getAnswer requires a question > rejects a … question without calling OpenAI` cases, with
  `getAnswer requires a question > still answers when a question is given` as the positive
  control).
- Given `GET /healthz`, when the embeddings are loaded, then it responds 200 `ok`, and 503
  `embeddings are not loaded` when the load fails (unguarded).
- Given a `message` event whose subtype is on the non-user deny list, or which carries
  `bot_id` or `hidden`, when the handler runs, then it returns without reacting or replying
  (guarded: `isPlainUserMessage > rejects every subtype on the deny list`,
  `isPlainUserMessage > rejects an event carrying a bot_id even with no subtype`,
  `isPlainUserMessage > rejects a hidden event even with no subtype and no bot_id`, and at
  the handler level `the message handler > leaves no trace at all on the link unfurl of its
  own answer`, `the message handler > ignores another bot posting text into the DM` and
  `the message handler > leaves no trace on the notice a pinned message produces`).
- Given a `message` event with an unrecognised subtype, then the first guard accepts it, so
  an unknown subtype behaves as it did before the guard existed (guarded at predicate level
  only: `isPlainUserMessage > accepts an unrecognised subtype, so an unknown behaves as
  before`; no handler-level test asserts such an event is answered). Where it carries nothing
  to answer the second guard drops it (guarded: `the message handler > leaves no trace when
  an unrecognised subtype carries nothing to answer`).
- Given a message with an audio file, when the handler runs, then the file is transcribed,
  the transcript is echoed in-thread and used as the question (guarded:
  `the message handler > transcribes a voice note and answers what was said`).
- Given a multi-file upload whose voice note is not first, when the handler runs, then the
  voice note is the file transcribed (guarded: `the message handler > transcribes the voice
  note in a multi-file upload it is not first in`).
- Given a document or a video attachment, when the handler runs, then nothing is sent to the
  transcription API and the typed question is answered (guarded: `the message handler >
  answers the typed question and never sends a document to Whisper` and `the message handler
  > answers the typed question rather than a video soundtrack`).
- Given an attachment the bot cannot read and nothing typed alongside it, when the handler
  runs, then it asks the user to type the question instead of posting the generic error
  (guarded:
  `the message handler > says it could not read an attachment sent with nothing typed`).
- Given a message forwarded into the DM with no comment, when the handler runs, then the bot
  asks for a question rather than answering the shared content (guarded:
  `the message handler > asks for a question when a message is forwarded with no comment`).
- Given audio that yields no words and nothing typed alongside it, when the handler runs,
  then it says it could not make out any words rather than posting the generic error
  (guarded: `the message handler > tells the user the audio was not understood rather than
  posting the generic error` and `the message handler > treats a recording that transcribes
  to only whitespace as no words heard`).
- Given audio that yields nothing, or a transcription that throws, with a question typed
  alongside it, when the handler runs, then the typed question is answered and the user is
  told the attachment was not read (guarded: `the message handler > falls back to the text
  alongside a file when the audio yields nothing`, `the message handler > falls back to the
  text alongside a file when the transcription fails` and `the message handler > keeps the
  typed question when the transcription is only whitespace`).
- Given a transcription that throws with nothing typed alongside it, when the handler runs,
  then the fixed error message is posted instead of an answer (guarded: `the message handler
  > reports the generic error when the transcription fails and nothing was typed`).
- Given one of the fire-and-forget Slack calls rejects, when the handler runs, then the
  answer is still delivered and no unhandled rejection escapes (guarded, all four unawaited
  calls: `the message handler > answers anyway when the reaction it does not wait for is
  rejected`, `the message handler > answers anyway when the interim acknowledgement is
  rejected`, `the message handler > answers anyway when the transcription acknowledgement is
  rejected` and `the message handler > answers anyway when the attachment fallback
  acknowledgement is rejected`; and for an awaited notice, `the message handler > does not
  report an internal failure when the silent recording notice cannot be posted`).
- Given a download that fails to connect, breaks part way through, cannot be written, stalls,
  or answers non-2xx, when `downloadAudio()` runs, then it rejects and leaves no file behind
  (guarded: the ten `downloadAudio > …` cases, including `downloadAudio > leaves nothing
  behind when the response fails part way through` and `downloadAudio > rejects a non-2xx
  response rather than writing the error body to disk`).
- Given a signed download URL carrying a query string and a port, when `downloadAudio()`
  runs, then both are preserved in the request (guarded:
  `downloadAudio > keeps the query string and port the download URL carries`).
- Given two downloads of the same Slack file, when `downloadAudio()` runs, then each writes
  its own scratch file under the system temporary directory (guarded: `downloadAudio > gives
  each download its own scratch file` and `downloadAudio > writes the audio under the system
  temporary directory`).
- Given a transcription that resolves or throws, when `transcribe()` runs, then the
  downloaded audio is removed either way (guarded: `transcribe > removes the downloaded audio
  once the transcription has been read`, `transcribe > removes the downloaded audio when the
  transcription throws` and `transcribe > tolerates the downloaded audio already being gone`).
- Given a transcription response that is a bare string, an object carrying `text`, only
  whitespace, or unusable, when `transcriptionText()` runs, then it returns the trimmed words
  or the empty string, never `undefined` (guarded: the seven `transcriptionText > …` cases and
  `transcribe > returns an empty string, never undefined, for an unusable response`).
- Given the `summarize` shortcut on a message with links or files, when it is invoked, then
  one ephemeral summary is posted per link and per file (unguarded).
- Given an `OBJECT_FINALIZE` Pub/Sub message for the embeddings object, when it arrives,
  then it is acked and the data set is reloaded (unguarded).
- Given the reload throws after the message was acked, when it fails, then the failure
  **should** be logged and the reload retried (unguarded). **The implementation does
  neither**: `packages/slack-bot/src/getAnswer.js:83` awaits the reload with no
  `try`/`catch`, and since the message is already acked Pub/Sub will not redeliver, so the
  bot serves the previous corpus until a later message or a restart. Treat this criterion
  as the invariant to restore.
- Given an environment missing any always-required variable, when `validateEnv()` runs,
  then it throws one error naming every missing variable and no variable's value (guarded:
  the `slack-bot validateEnv` suite).
- Given `IS_LOCAL_ENVIRONMENT` is unset, when `validateEnv()` runs, then `GCP_PROJECT_ID`
  and `GCP_EMBEDDING_SUBSCRIPTION` are required; given it is set to a truthy value, they
  are not (guarded: `slack-bot validateEnv > requires the Pub/Sub variables when
  IS_LOCAL_ENVIRONMENT is unset` and `... does not require the Pub/Sub variables when
  IS_LOCAL_ENVIRONMENT is set`).
- Given the required variables are absent, when `packages/slack-bot/src/index.js` is
  loaded, then the module rejects with an error naming them and no `ExpressReceiver`, Bolt
  `App` or OpenAI client is constructed (guarded: `loading the slack bot entry point
  without its environment rejects before any client is constructed`).

## Non-goals & boundaries

- Does not crawl Notion or create embeddings. See [crawler](./crawler.md) and
  [embeddings-creation](./embeddings-creation.md).
- Does not hold conversation history: each question is answered independently. The
  `@TODO` at `getAnswer.js:207` marks this as a known gap.
- Does not use Slack Socket Mode: HTTP only, because it deploys as a function.
- Does not answer content shared into the DM with no comment. Message `attachments` are
  enough to earn a reply, but the reply asks for a question rather than treating the shared
  message as one (`bot.js:203-215`).
- Does not read anything but audio from an attachment on the answering path. There is no
  document, image or video handling there: `isTranscribableFile` rejects them, nothing is
  sent to OpenAI, and the typed question is answered instead. The `summarize` shortcut is
  where files are read.
- Does not persist application state. The embeddings data set is in-memory and rebuilt on
  restart. Two files are written to disk as a side effect: the embeddings cache at
  `/tmp/embeddings-<pid>.csv`, which nothing removes, and, per transcribed attachment, a
  scratch file `<file id>-<uuid>.mp4` under `os.tmpdir()`, which `transcribe` removes in a
  `finally` and `downloadAudio` removes on any failure
  (`packages/slack-bot/src/utils.js:73`, `:107`, `:225-231`).
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
  `GCP_EMBEDDING_SUBSCRIPTION`, `MAX_CONTEXT_TOKENS`, `IS_LOCAL_ENVIRONMENT`. All but the
  last two are required and validated at startup by `packages/slack-bot/src/env.js`, with
  `GCP_PROJECT_ID` and `GCP_EMBEDDING_SUBSCRIPTION` required only outside the local
  environment.
- Slack OAuth scopes and the `message.im` bot event subscription are declared in `slack_manifest.yaml`. The `summarize` shortcut is registered in code at `packages/slack-bot/src/summarize.js:20`, not in the manifest.
- The non-user `message` subtype deny list is a module-scope `Set` at
  `packages/slack-bot/src/messageEvents.js:35-64`. It is configuration expressed in code
  rather than in the environment or the manifest, so adding a subtype means editing that
  list.

## Dependencies & interactions

- **Called by:** Slack (events and shortcuts), the Cloud Run startup probe, Pub/Sub.
- **Calls:** OpenAI (embeddings, chat completions, responses, audio transcriptions), Google
  Cloud Storage, Google Cloud Pub/Sub, the Slack Web API.
- **Upstream:** [embeddings-creation](./embeddings-creation.md) owns the
  `index,text,n_tokens,embeddings` contract this component reads.

## Key flows

1. **Answer.** Message event → drop it unless `isPlainUserMessage` and `carriesQuestion`
   both pass → react and look up the locale → transcribe the first transcribable file and
   echo the transcript, or acknowledge, or reply that the attachment or share carried no
   question → `getAnswer()` → post the answer, or the fixed error message if anything
   awaited threw.
2. **Context assembly.** Embed the question → cosine distances over the data set → sort
   ascending → take chunks until the token budget is spent → build the prompt → complete.
3. **Startup.** The entry point validates the environment, then imports `bot.js` →
   import kicks off the embeddings load → the startup probe on `/healthz`
   awaits it → once loaded, subscribe to embedding updates (non-local only).
4. **Refresh.** `OBJECT_FINALIZE` for the embeddings object → ack → reload the data set.
5. **Summarise.** Shortcut → for each attached file, fetch and base64 it, then summarise;
   for each link in the message blocks, summarise with web search → ephemeral reply each.

## Tests & verification

Tests live in `packages/slack-bot/test/` (fixtures in `test/mocks/`) and run with
`npm test --workspace=slack-bot`. The workspace reports 116 passing tests in 15 suites as of
2026-09-10. Two of the 116 are the test-less fixture modules in `test/mocks/`, which node's
default glob executes as test files, so there are 114 real tests across these eleven files:

| File | Covers |
|---|---|
| `test/getAnswer.test.js` | the whole prompt array, asserted with `calledOnceWithExactly` |
| `test/getAnswerContextBudget.test.js` | the token budget and `MAX_CONTEXT_TOKENS` parsing |
| `test/getAnswerInitialization.test.js` | load failure and retry, the empty-context warning |
| `test/getAnswerQuestionRequired.test.js` | the question guard, and that OpenAI is not called |
| `test/distancesFromEmbeddings.test.js` | distances against the original Python values |
| `test/download.test.js` | the non-local `download` destination |
| `test/messageEvents.test.js` | five of the six predicates directly, including every deny-list subtype |
| `test/messageHandler.test.js` | the `message` handler, through a stubbed Bolt app and `client` |
| `test/transcribe.test.js` | `downloadAudio`, `transcribe` and `transcriptionText` |
| `test/env.test.js` | `validateEnv`: the required sets, the conditional Pub/Sub pair, and that no value is leaked |
| `test/startupValidation.test.js` | that `src/index.js` rejects before any client is constructed |

Coverage is now broad but not uniform. `packages/slack-bot/src/getAnswer.js`,
`packages/slack-bot/src/messageEvents.js` (bar `hasAttachments`, reached only through
`carriesQuestion`) and the transcription half of
`packages/slack-bot/src/utils.js` are well covered, and `packages/slack-bot/src/bot.js`'s
`message` handler is covered for every branch of the attachment and transcription flow
including each fire-and-forget rejection. What remains unguarded:
`packages/slack-bot/src/summarize.js` entirely, `/healthz`, the Pub/Sub refresh path, and
the shared-load property of `initialize()` (no test starts concurrent callers).

Note that `packages/slack-bot/test/download.test.js` must clear `IS_LOCAL_ENVIRONMENT` and
live in its own file, because `packages/slack-bot/src/utils.js` reads that variable at import time and a module
specifier can only be mocked once per process. `test/messageHandler.test.js` mocks
`@slack/bolt` itself to capture the registered handler, which is what made the handler
testable at all.

## Related code

- `packages/slack-bot/src/getAnswer.js`
- `packages/slack-bot/src/bot.js`
- `packages/slack-bot/src/messageEvents.js`
- `packages/slack-bot/src/summarize.js`
- `packages/slack-bot/src/utils.js`
- `packages/slack-bot/src/env.js`
- `packages/slack-bot/src/index.js`, `packages/slack-bot/src/dev.js`
