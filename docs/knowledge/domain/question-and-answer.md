---
title: Question and answer
type: domain
tags: [ubiquitous-language, user-facing]
source_paths:
  - packages/slack-bot/src/bot.js
  - packages/slack-bot/src/messageEvents.js
  - packages/slack-bot/src/getAnswer.js
source_commit: 4a9f973
created: 2026-09-09
updated: 2026-09-09
---

# Question and answer

The user-facing exchange, and the only thing users actually judge the system by.

## A question

A direct message to the bot. Its text is the question, unless the message carries audio the
bot can transcribe, in which case the transcript is the question instead
([[audio-transcription-path]]). A question is **required**: `getAnswer` throws rather than
defaulting, so a message with nothing answerable in it never reaches the model. Two
attributes travel with it and affect the answer:

- **The asker's locale**, from `users.info`, defaulting to `en-IE`. It is injected into
  [[prompt-contract]] so country-specific answers are relevant, which matters for a
  distributed company where policy differs by country.
- **Nothing else.** No history, no thread context, no identity beyond locale. Each question
  stands alone. See [[retrieval-augmented-answering]].

## An answer

The trimmed content of the first completion choice. Its properties are worth stating
plainly, because they set user expectations:

- **Sourced only from [[content-chunk]]s**, by instruction rather than by mechanism. The
  prompt forbids outside knowledge; nothing enforces it.
- **Unattributed.** The prompt forbids naming the source, and [[content-chunk]] could not
  name it anyway.
- **Not signalled for confidence.** A poor retrieval produces a fluent, confident answer.
  The only internal alarm is the empty-context warning in [[context-token-budget]].

## What the user sees along the way

A `thumbsup` reaction as an immediate receipt, then a holding message
("Let me check available information on that for you"), then the answer as a separate
message. On a voice note the holding message is replaced by an echo of what was heard
(`Give me a moment whilst I check for you. You asked: "..."`), posted in-thread. Where the
attachment was no use but a question was typed alongside it, the asker is told so before the
answer arrives. When an awaited step inside the handler throws, one fixed string:

> It appears I have run into an issue looking up an answer for you. Please try again

The same string covers every failure that reaches the outer catch, so a user cannot
distinguish "OpenAI is down" from "the embeddings never loaded". Diagnosis needs the Cloud
Run logs.

**Several situations never produce it**, so do not treat it as a universal guarantee, and
do not reach for it when adding a case:

- A locale lookup failure is caught locally and falls back to the default locale, posting
  nothing.
- The unawaited `reactions.add` and interim `postMessage` calls each carry their own
  `.catch(console.error)`, so a Slack failure there is logged and the answer still arrives.
- Four situations get a reply written for them instead, because they are the user's to fix
  and "please try again" would send them round a loop that cannot help. Audio with no words
  in it, an unreadable attachment sent with nothing typed, and a share with no question each
  get that reply *in place of* an answer. An attachment that failed while a question was
  typed alongside it gets a notice *as well as* the answer to what was typed.

See [[answer-a-question-end-to-end]].

Handled by [[slack-event-surface]].
