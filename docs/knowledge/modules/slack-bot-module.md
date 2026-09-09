---
title: Slack bot module
type: module
tags: [slack, bolt, openai, cloud-function]
source_paths:
  - packages/slack-bot/src/bot.js
  - packages/slack-bot/src/getAnswer.js
  - packages/slack-bot/src/summarize.js
  - packages/slack-bot/src/utils.js
  - packages/slack-bot/src/index.js
  - packages/slack-bot/src/dev.js
source_commit: c4bc5ac
created: 2026-09-09
updated: 2026-09-09
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
| `src/getAnswer.js` | data-set lifecycle, context assembly, the completion call |
| `src/summarize.js` | the shortcut handler for links and files |
| `src/utils.js` | storage download, CSV parse, distance maths, audio transcription |
| `src/index.js` | exports the Express app as `slackBot` for the functions framework |
| `src/dev.js` | starts Bolt directly for local development |

`src/index.js` and `src/dev.js` are two entry points to the same app: the function runtime
serves the Express app, while `npm run dev` uses Bolt's own listener.

## The subtle part

`src/getAnswer.js` carries three coupled behaviours that must be preserved together, and
they are the thing to understand before changing this module:
[[embedding-lifecycle-and-warm-start]].

## Deliberately unauthenticated

`/healthz` is registered on `expressReceiver.app`, outside Bolt's `/slack/events` mount,
so no signature check applies to it. That is by design, and it is why the route must stay
free of anything sensitive. See [[slack-event-surface]].

## Test coverage is uneven

`getAnswer.js` and `utils.js` are well covered; `bot.js` and `summarize.js` have no tests
at all. The message handler, the transcription wiring and the shortcut are all unguarded.
See [[test-strategy-module-mocks]] and the coverage labels in the spec.

Part of [[project-overview]]. Consumes [[content-chunk]] rows produced by
[[embeddings-creation-module]].
