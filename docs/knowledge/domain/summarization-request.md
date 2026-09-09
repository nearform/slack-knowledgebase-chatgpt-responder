---
title: Summarization request
type: domain
tags: [ubiquitous-language, shortcut, secondary-feature]
source_paths:
  - packages/slack-bot/src/summarize.js
source_commit: c4bc5ac
created: 2026-09-09
updated: 2026-09-09
---

# Summarization request

The repo's **second, independent capability**, and an outlier in the domain: it touches no
Notion content, no embeddings and no retrieval. Reading the code, expect it to feel
unrelated to everything else, because it is.

Invoked as a Slack **message shortcut** named `summarize`, registered in code at
`packages/slack-bot/src/summarize.js:20` (not in `slack_manifest.yaml`).

## Two kinds of thing get summarised

| Target | How it is fetched | Model call |
|---|---|---|
| Files attached to the message | `files.info`, then the private URL with a bearer token, base64'd | `responses.create` with an `input_file` |
| Links in the message's rich-text blocks | not fetched by us at all | `responses.create` with the `web_search_preview` tool |

For links, **OpenAI does the fetching**, via its web-search tool. That is the only place in
the repo where content is pulled from the open web, and it happens at answer time rather
than crawl time ([[external-integrations]]).

## Behaviour

- One ephemeral reply per item, so the summary is visible only to the requester.
- File summaries are asked to be "formatted for Slack".
- Failures are logged and `continue`d: an unreadable file is skipped silently and the user
  simply gets no reply for it.
- Link extraction only walks `rich_text` blocks and only `rich_text_section` elements, so
  links in other block shapes are missed.

## Why it matters when changing the bot

It shares the OpenAI client and the Bolt app with the answering path, and it uses `gpt-4.1`
as they do, so a change to either shared object affects both. It has **no tests
whatsoever** and no prompt-assertion guard of the kind [[prompt-contract]] enjoys.

Part of [[slack-bot-module]]. Contrast with [[question-and-answer]], the primary flow.
