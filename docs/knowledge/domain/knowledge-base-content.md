---
title: Knowledge base content
type: domain
tags: [notion, ubiquitous-language, source-of-truth]
source_paths:
  - packages/crawler/src/notion.js
  - README.md
source_commit: c4bc5ac
created: 2026-09-09
updated: 2026-09-09
---

# Knowledge base content

**"The Nearform way"**, a section in Notion, is the single source of truth for everything
this system answers. Nothing else is authoritative, and nothing in the repo edits it.

## What the system considers "the knowledge base"

Not the Notion section as a curated whole: it is **whatever pages the Notion integration
can see**. Access is granted by adding the `slack-kb-chatgpt-responder` integration as a
connection on a Notion page, and `notion.search()` then returns every page reachable that
way.

This is the key operational fact about the domain: **the corpus boundary is a Notion
permission, not a code decision.** Connecting the integration to another page silently
widens what the bot will answer from; disconnecting one silently narrows it. There is no
allowlist, no path filter, no manifest of expected pages, and no count to compare against.

## What a page becomes

One page becomes one flattened record of `{ index, title, text }`
([[crawler-module]]), which becomes one or more [[content-chunk]]s
([[chunking-strategy]]). The `title` is captured but, notably, **never used downstream**:
retrieval and prompting operate on `text` alone, so a page's title contributes nothing to
whether it is found.

## Freshness

Content is as fresh as the last scheduled crawl, plus the embedding pass, plus the bot's
Pub/Sub reload. A Notion edit is not visible immediately. Walk it through with
[[refresh-the-knowledge-base]].

## Handling

Internal Nearform material. It is sent to OpenAI ([[external-integrations]]) and lands on
disk as `scraped.csv`, `embeddings.csv` and `.cache/` contents, all git-ignored. Keep them
that way.
