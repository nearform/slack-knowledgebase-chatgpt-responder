---
title: Answer a question end to end
type: tour
tags: [reading-path, request-flow]
source_paths:
  - packages/slack-bot/src/bot.js
  - packages/slack-bot/src/getAnswer.js
  - packages/slack-bot/src/utils.js
source_commit: c4bc5ac
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

## 1. Arrival — `bot.js:41`

Slack POSTs to `/slack/events`. Bolt's `ExpressReceiver` verifies the signature
([[slack-event-surface]]) and dispatches to the `message` handler, which returns
immediately if the subtype is `bot_message`. That check is the loop guard.

## 2. Receipt — `bot.js:54`

A `thumbsup` reaction, then a `users.info` lookup for the asker's locale in its own
`try`/`catch`, then a holding message. None of the Slack calls here are awaited, so they
do not delay the answer.

If a file is attached, the [[audio-transcription-path]] runs instead and its transcript
becomes the question.

## 3. Ensure the data set — `getAnswer.js:142`

`getAnswer()` awaits `initialize()`. Normally already resolved, so this is free. If the
earlier load failed, this is where the retry happens.

## 4. Embed the question — `getAnswer.js:105`

`createContext` calls `openai.embeddings.create` with `text-embedding-ada-002`, the same
model the corpus used. That match is load-bearing:
[[retrieval-augmented-answering]].

## 5. Rank — `getAnswer.js:113`

`distancesFromEmbeddings` scores every chunk, linear scan, in process. Sorted ascending.
[[cosine-distance-ranking]].

## 6. Fill the budget — `getAnswer.js:121-131`

Walk the sorted chunks, adding `n_tokens + 4` each, and break at the first that would
exceed `maxLength`. [[context-token-budget]].

## 7. Notice an empty context — `getAnswer.js:166`

If the data set was non-empty but nothing fitted, log the warning and carry on. The only
retrieval-quality alarm in the system.

## 8. Build the prompt — `getAnswer.js:172`

Eight messages, chunks joined with `\n\n###\n\n`, locale interpolated.
[[prompt-contract]] and [[prompt-message-sequence]].

## 9. Complete — `getAnswer.js:209`

`gpt-4.1`, `temperature: 0`. Note the full prompt is `console.log`ged just before this, so
production logs contain the retrieved content.

## 10. Reply — `bot.js:99`

The trimmed answer is posted. An awaited rejection from step 3 onwards lands in the outer
`catch`, which posts one fixed error string, identical for every failure mode. Two classes
of failure do **not** arrive there: the locale lookup and the transcription each have their
own inner handler, and the unawaited `reactions.add` and holding-message calls reject
outside the `await` chain entirely, so their failures surface only as unhandled
rejections.
[[question-and-answer]].

## Where you could get lost

Steps 4 to 8 all live inside `getAnswer.js` and the split between `getAnswer` and
`createContext` is not obvious from the names: `createContext` does the retrieval,
`getAnswer` does the prompting. Both read the token budget independently from the
environment.
