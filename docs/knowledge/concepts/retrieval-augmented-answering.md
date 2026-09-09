---
title: Retrieval augmented answering
type: concept
tags: [rag, core-idea]
source_paths:
  - packages/slack-bot/src/getAnswer.js
source_commit: c4bc5ac
created: 2026-09-09
updated: 2026-09-09
---

# Retrieval augmented answering

The idea the whole repo serves. The model is never asked to know anything about Nearform;
it is asked to read a passage and answer from it.

The chain, per question:

1. Embed the question with the same model the corpus was embedded with
   (`text-embedding-ada-002`).
2. Rank every stored [[content-chunk]] by [[cosine-distance-ranking]].
3. Take the nearest chunks until [[context-token-budget]] is spent.
4. Wrap them in [[prompt-contract]], which forbids the model from using anything else.
5. Return the completion verbatim, trimmed.

## Why each piece matters

- **Matching embedding models** is not optional. Embedding the question with a different
  model than the corpus compares vectors from different spaces; cosine distance would
  still return numbers, and they would be noise. This is why the model is a constant in
  two packages rather than a config value.
- **The budget** is what stops the prompt exceeding the model's context window, and its
  guard against a bad value is deliberately strict.
- **The prompt contract** is what makes the answer attributable to the knowledge base
  rather than to the model's training data.

## What this design cannot do

- **No conversation.** Each question is answered independently; there is no history. The
  `@TODO` at `packages/slack-bot/src/getAnswer.js:200` marks the intended place for it.
- **No citations.** The prompt explicitly forbids mentioning the source, so a user cannot
  tell which Notion page an answer came from, and cannot check it.
- **No "I do not know" beyond an apology.** If nothing relevant is retrieved, the model is
  told to apologise briefly. There is no confidence signal, and no distinction between
  "the knowledge base does not cover this" and "retrieval missed it".
- **Retrieval quality is invisible.** The only observability is a warning when a non-empty
  data set yields an empty context. A *poor* context produces a confident, wrong answer
  silently.

Implemented by [[slack-bot-module]]. The corpus it draws on is
[[knowledge-base-content]].
