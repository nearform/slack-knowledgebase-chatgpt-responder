---
title: Project overview
type: architecture
tags: [overview, monorepo, rag]
source_paths:
  - package.json
  - packages/crawler/package.json
  - packages/embeddings-creation/package.json
  - packages/slack-bot/package.json
  - README.md
source_commit: 633de22
created: 2026-09-09
updated: 2026-09-09
---

# Project overview

An npm-workspaces monorepo holding **three independently deployed Node.js services** that
together implement [[retrieval-augmented-answering]] over Nearform's internal Notion
content. All three are ESM, Node 24, and deploy to Google Cloud in `europe-west1`.

| Workspace | Role | Runtime shape |
|---|---|---|
| [[crawler-module]] | Read Notion, write `scraped.csv` | Cloud Run **job**, on a schedule |
| [[embeddings-creation-module]] | Embed the text, write `embeddings.csv` | Cloud **function**, event-triggered |
| [[slack-bot-module]] | Answer questions in Slack | Cloud **function**, HTTP |

## Why three services and not one

The three stages have completely different runtime profiles, and splitting them lets each
get what it needs:

- The crawl is slow, rate limited by Notion, and runs on a schedule. A job that exits is
  the right shape; nothing needs to stay warm.
- The embedding pass is memory hungry (the whole corpus is held in memory, hence 2GiB) and
  runs rarely, only when new content lands.
- The bot must answer in seconds and stay warm, holding the embeddings in memory. See
  [[embedding-lifecycle-and-warm-start]].

The cost of the split is that they must agree on a data contract without sharing code.
That contract is [[csv-as-interchange-format]], and the coupling mechanism is
[[pipeline-data-flow]].

## What is deliberately duplicated

Each package carries its own small `src/utils.js` with near-identical storage helpers.
This is intentional, not an oversight: see [[shared-storage-utils]].

## Where to read next

Follow [[start-here]] for an ordered path, or jump to [[pipeline-data-flow]] for the
mechanism that ties the three together.
