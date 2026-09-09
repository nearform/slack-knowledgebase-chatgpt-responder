---
title: Answer a question end to end
type: tour
tags: [reading-path, request-flow]
source_paths:
  - packages/slack-bot/src/bot.js
  - packages/slack-bot/src/messageEvents.js
  - packages/slack-bot/src/getAnswer.js
  - packages/slack-bot/src/utils.js
source_commit: 4a9f973
created: 2026-09-09
updated: 2026-09-09
---

# Answer a question end to end

Follow one direct message from arrival to reply, in code order. Read alongside
`packages/slack-bot/src/bot.js` and `getAnswer.js` open.

## 0. Before any question arrives

`getAnswer.js` was imported at cold start and **already began loading the embeddings**, and
Cloud Run's startup probe hit `/healthz` to await that load with full CPU. If you skip this
step you will misread everything that follows. See
[[embedding-lifecycle-and-warm-start]].

## 1. Arrival and two guards: `bot.js:68`

Slack POSTs to `/slack/events`. Bolt's `ExpressReceiver` verifies the signature
([[slack-event-surface]]) and dispatches to the `message` handler, which returns
immediately unless both `isPlainUserMessage(event)` (`bot.js:77`) and
`carriesQuestion(event)` (`bot.js:83`) pass. The first is the loop guard. Both sit ahead of
everything visible, so a dropped event leaves no reaction and no reply.

## 2. Receipt: `bot.js:106`

A `thumbsup` reaction, then a `users.info` lookup for the asker's locale in its own
`try`/`catch`, then a holding message. The `users.info` call **is** awaited
(`packages/slack-bot/src/bot.js:115`), so the locale lookup does add latency to every
answer. Only the reaction and the holding message are fire-and-forget.

Then the handler branches on what arrived (`bot.js:133-223`). A transcribable file takes the
[[audio-transcription-path]], which replaces `questionInput` with the transcript and echoes
it in-thread. An attachment it cannot read, or a message shared with no comment, gets a
reply asking for a typed question and the handler returns. Otherwise the holding message
goes out.

## 3. Ensure the data set: `getAnswer.js:158`

`getAnswer()` awaits `initialize()`. Normally already resolved, so this is free. If the
earlier load failed, this is where the retry happens. Before that await, the question guard
(`getAnswer.js:154`) rejects a missing, empty or non-string question, so a spurious event
costs nothing.

## 4. Embed the question: `getAnswer.js:105`

`createContext` calls `openai.embeddings.create` with `text-embedding-ada-002`, the same
model the corpus used. That match is load-bearing:
[[retrieval-augmented-answering]].

## 5. Rank: `getAnswer.js:113`

`distancesFromEmbeddings` scores every chunk, linear scan, in process. Sorted ascending.
[[cosine-distance-ranking]].

## 6. Fill the budget: `getAnswer.js:122-131`

Walk the sorted chunks, adding `n_tokens + 4` each, and break at the first that would
exceed `maxLength`. [[context-token-budget]].

## 7. Notice an empty context: `getAnswer.js:173`

If the data set was non-empty but nothing fitted, log the warning and carry on. The only
retrieval-quality alarm in the system.

## 8. Build the prompt: `getAnswer.js:179`

Eight messages, chunks joined with `\n\n###\n\n`, locale interpolated.
[[prompt-contract]] and [[prompt-message-sequence]].

## 9. Complete: `getAnswer.js:216`

`gpt-4.1`, `temperature: 0`. Note the full prompt is `console.log`ged just before this, so
production logs contain the retrieved content.

## 10. Reply: `bot.js:245`

The trimmed answer is posted. An awaited rejection from step 3 onwards lands in the outer
`catch` (`bot.js:252`), which posts one fixed error string, identical for every failure
mode. Several classes of failure do **not** arrive there: the locale lookup and the
transcription each have their own inner handler, and the unawaited `reactions.add` and
interim `postMessage` calls each carry a `.catch(console.error)`, so a Slack failure on one
of them is logged and the answer still arrives rather than escaping as an unhandled
rejection.
[[question-and-answer]].

## Where you could get lost

Steps 4 to 8 all live inside `getAnswer.js` and the split between `getAnswer` and
`createContext` is not obvious from the names: `createContext` does the retrieval,
`getAnswer` does the prompting. Both read the token budget independently from the
environment.
