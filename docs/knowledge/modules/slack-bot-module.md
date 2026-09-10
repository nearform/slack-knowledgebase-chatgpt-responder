---
title: Slack bot module
type: module
tags: [slack, bolt, openai, cloud-function]
source_paths:
  - packages/slack-bot/src/bot.js
  - packages/slack-bot/src/messageEvents.js
  - packages/slack-bot/src/getAnswer.js
  - packages/slack-bot/src/summarize.js
  - packages/slack-bot/src/utils.js
  - packages/slack-bot/src/env.js
  - packages/slack-bot/src/index.js
  - packages/slack-bot/src/dev.js
source_commit: 4a9f973
created: 2026-09-09
updated: 2026-09-10
---

# Slack bot module

The only user-facing component, and the only one with meaningful internal structure.
Contract and acceptance criteria: [`../../slack-bot.md`](../../slack-bot.md).

## Two capabilities in one deployable

They share nothing but the OpenAI client and the Slack app:

1. **Question answering** — the `message` event handler in `src/bot.js` delegating to
   `getAnswer()`. This is what the repo exists for. See
   [[retrieval-augmented-answering]].
2. **Summarising** — the `summarize` shortcut in `src/summarize.js`, which reads no
   embeddings at all. See [[summarization-request]].

Reading the module, expect the second to feel bolted on, because it is: it touches none of
the retrieval machinery.

## Responsibilities by file

| File | Holds |
|---|---|
| `src/bot.js` | the Bolt app, the receiver, the `message` handler, `/healthz` |
| `src/messageEvents.js` | pure predicates deciding which events and files the handler acts on |
| `src/getAnswer.js` | data-set lifecycle, context assembly, the completion call |
| `src/summarize.js` | the shortcut handler for links and files |
| `src/utils.js` | storage download, CSV parse, distance maths, audio download and transcription |
| `src/env.js` | the required-variable list and `validateEnv()`, called by both entry points |
| `src/index.js` | validates the environment, then exports the Express app as `slackBot` for the functions framework |
| `src/dev.js` | validates the environment, then starts Bolt directly for local development |

`src/index.js` and `src/dev.js` are two entry points to the same app: the function runtime
serves the Express app, while `npm run dev` uses Bolt's own listener. Both call
`validateEnv()` before importing `src/bot.js`, and both import it dynamically for that
reason: `src/bot.js` builds its receiver, app and OpenAI client as it loads, so a static
import would run all of that first. See [[external-integrations]].

`src/messageEvents.js` holds no I/O and imports nothing. Its job is to keep the "should we
act on this?" decisions out of the handler, where they could only be tested by standing up
a Bolt app: see [[slack-event-surface]]. Add a predicate there rather than inlining a
condition in `src/bot.js`.

## The subtle part

`src/getAnswer.js` carries three coupled behaviours that must be preserved together, and
they are the thing to understand before changing this module:
[[embedding-lifecycle-and-warm-start]].

## Deliberately unauthenticated

`/healthz` is registered on `expressReceiver.app`, outside Bolt's `/slack/events` mount,
so no signature check applies to it. That is by design, and it is why the route must stay
free of anything sensitive. See [[slack-event-surface]].

## Test coverage is uneven, but far less so than it was

The workspace reports 116 tests in 15 suites, 114 of them real: node's default glob also
executes the two test-less fixture modules under `test/mocks/`.

Well covered:

- `getAnswer.js`, including the whole prompt array asserted with `calledOnceWithExactly`,
  the token budget, the load-failure retry, and the question guard.
- `messageEvents.js`: five of its six predicates have their own `describe` block, including
  a case asserting every one of the 28 subtypes on the deny list is rejected
  (`packages/slack-bot/test/messageEvents.test.js`). `hasAttachments` has no direct test and
  is exercised only through `carriesQuestion`.
- The transcription half of `utils.js`: ten cases for `downloadAudio`, six for `transcribe`
  and seven for `transcriptionText` (`packages/slack-bot/test/transcribe.test.js`).
- The `message` handler in `bot.js`, through a mocked `@slack/bolt` that captures the
  registered handler (`packages/slack-bot/test/messageHandler.test.js`): every branch of the
  attachment and transcription flow, and each fire-and-forget rejection.
- `env.js` and the entry point's validate-before-import order
  (`packages/slack-bot/test/env.test.js`,
  `packages/slack-bot/test/startupValidation.test.js`).

The rest of `utils.js` is covered in part: `download`
(`packages/slack-bot/test/download.test.js`) and `distancesFromEmbeddings`
(`packages/slack-bot/test/distancesFromEmbeddings.test.js`) have direct tests, and
`parseCsv` is exercised indirectly because the `getAnswer` tests spread the real module and
override only `download`.

Still unguarded: `summarize.js` entirely, `/healthz`, the Pub/Sub refresh path, and the
shared-load property of `initialize()`. See [[test-strategy-module-mocks]] and the coverage
labels in the spec.

Part of [[project-overview]]. Consumes [[content-chunk]] rows produced by
[[embeddings-creation-module]].
