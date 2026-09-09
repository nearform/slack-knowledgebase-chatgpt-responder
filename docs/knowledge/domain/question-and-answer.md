---
title: Question and answer
type: domain
tags: [ubiquitous-language, user-facing]
source_paths:
  - packages/slack-bot/src/bot.js
  - packages/slack-bot/src/getAnswer.js
source_commit: c4bc5ac
created: 2026-09-09
updated: 2026-09-09
---

# Question and answer

The user-facing exchange, and the only thing users actually judge the system by.

## A question

A direct message to the bot. Its text is the question. A file attachment is meant to make
the transcript the question instead, but that path returns nothing as written
([[audio-transcription-path]]), so the text is what is answered either way. Two attributes
travel with it and affect the answer:

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
message. On a question with a file attached the holding message is meant to be replaced by
an echo of what was heard, but that echo never posts because the transcript comes back
empty ([[audio-transcription-path]]), so the asker gets the reaction and then the answer,
with no message in between. When an awaited step inside the handler throws, one fixed
string:

> It appears I have run into an issue looking up an answer for you. Please try again

The same string covers every failure that reaches the outer catch, so a user cannot
distinguish "OpenAI is down" from "the embeddings never loaded". Diagnosis needs the Cloud
Run logs.

**Two failure modes never produce it**, so do not treat it as a universal guarantee. A
locale lookup failure is caught locally and falls back to the default locale, posting
nothing. And the unawaited `reactions.add` and holding-message calls reject outside the
`await` chain, so they bypass the catch entirely. See
[[answer-a-question-end-to-end]].

Handled by [[slack-event-surface]].
