---
title: Knowledge base index
type: architecture
tags: [moc, entry-point]
source_commit: c4bc5ac
created: 2026-09-09
updated: 2026-09-09
---

# Slack knowledge base ChatGPT responder — knowledge base

A retrieval-augmented Slack bot that answers Nearform employees' questions from the
company knowledge base in Notion. Content is crawled to a Google Cloud Storage bucket,
embedded with OpenAI, and queried by a Slack Bolt app that answers strictly from the
retrieved context.

This knowledge base explains **how the system fits together and why**. It complements,
and does not restate, the two artifacts that already exist:

- [`../../AGENTS.md`](../../AGENTS.md) — the lean agent context file: stack, commands,
  style, boundaries.
- [`../README.md`](../README.md) — the per-subsystem specs, with acceptance criteria and
  test coverage labels.

Where a spec states the contract, these notes explain the mechanism and the reasoning.

## Start here

- [[start-here]] — the guided reading path, in order.
- [[answer-a-question-end-to-end]] — follow one Slack message from arrival to answer.
- [[refresh-the-knowledge-base]] — follow a Notion edit through to a changed answer.

## Architecture

- [[project-overview]] — what the three deployables are and why the system is split this way.
- [[pipeline-data-flow]] — the bucket-as-message-bus design that couples the stages.
- [[gcp-deployment-topology]] — what runs where, and how it is provisioned.
- [[local-environment-emulation]] — how `IS_LOCAL_ENVIRONMENT` replaces the cloud with a folder.
- [[external-integrations]] — the four external services and what each is trusted for.

## Modules

- [[crawler-module]] — Notion to `scraped.csv`.
- [[embeddings-creation-module]] — `scraped.csv` to `embeddings.csv`.
- [[slack-bot-module]] — the user-facing Bolt app.
- [[shared-storage-utils]] — the deliberately triplicated storage helpers.

## Concepts

- [[retrieval-augmented-answering]] — the central idea the whole repo serves.
- [[chunking-strategy]] — how text is cut to fit the embedding model.
- [[cosine-distance-ranking]] — how relevance is decided.
- [[context-token-budget]] — how much context reaches the model, and the guard around it.
- [[prompt-contract]] — the message sequence that constrains the answer.
- [[embedding-lifecycle-and-warm-start]] — loading, memoising and refreshing the data set.
- [[csv-as-interchange-format]] — why CSV, and what it costs.
- [[slack-event-surface]] — what the bot listens to and what verifies it.
- [[audio-transcription-path]] — asking a question by voice note.
- [[resilience-and-rate-limiting]] — retries, backoff and concurrency caps.
- [[test-strategy-module-mocks]] — how the suite isolates network boundaries.

## Domain language

- [[knowledge-base-content]] — "The Nearform way", the source of truth.
- [[content-chunk]] — the unit of retrieval.
- [[question-and-answer]] — what a user exchange consists of.
- [[summarization-request]] — the second, unrelated capability the bot carries.

## Raw sources

- [[embeddings-csv-schema]] — the column contracts between stages.
- [[prompt-message-sequence]] — the verbatim prompt the model receives.
- [[deploy-step-commands]] — the provisioning commands, extracted.

## Provisioning record

| Capability | Provisioned |
|---|---|
| (a) Knowledge notes | yes |
| (b) Quartz graph viewer | no |
| (c) Query / explore interface | yes — see [[query-guide]] |
| (d) Incremental re-analysis git hook | no |

Analysis stages complete: project scan, module extraction, link pass, architecture and
domain map, guided tour, completeness review. Extracted at commit `c4bc5ac`.
