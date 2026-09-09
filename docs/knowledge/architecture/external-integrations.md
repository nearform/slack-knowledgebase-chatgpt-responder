---
title: External integrations
type: architecture
tags: [integrations, trust-boundaries, secrets]
source_paths:
  - packages/crawler/src/notion.js
  - packages/slack-bot/src/bot.js
  - packages/slack-bot/src/getAnswer.js
  - packages/embeddings-creation/src/create-embeddings.js
source_commit: c4bc5ac
created: 2026-09-09
updated: 2026-09-09
---

# External integrations

Four external services, each with a different trust relationship.

| Service | Used by | Credential | Trust direction |
|---|---|---|---|
| Notion | [[crawler-module]] | `NOTION_TOKEN` | we read; content is trusted internal material |
| OpenAI | embeddings + bot | `OPENAI_API_KEY` | we send internal content out; we trust the response as text |
| Slack | [[slack-bot-module]] | `SLACK_BOT_TOKEN` (out), `SLACK_SIGNING_SECRET` (in) | inbound requests are verified, see [[slack-event-surface]] |
| Google Cloud | all three | Workload Identity Federation in CI, ambient credentials at runtime | storage, Pub/Sub, secrets |

## The one inbound trust boundary

Only Slack sends us unsolicited requests, and that is the only place a signature check
exists: Bolt's `ExpressReceiver` verifies `/slack/events` against the signing secret. The
`/healthz` route is deliberately mounted **outside** that receiver and is therefore
unauthenticated. See [[slack-event-surface]].

## The data-egress boundary worth being deliberate about

Crawled Notion content is internal Nearform material, and every chunk of it is sent to
OpenAI: once at embedding time, and again as prompt context on every question. The corpus
also lands on disk as `scraped.csv`, `embeddings.csv` and `.cache/` contents, all
git-ignored. Treat those files as internal data.

Which model receives it is pinned in code rather than configured: `text-embedding-ada-002`
for vectors, `gpt-4.1` for answers and summaries, `whisper-1` for transcription. See
[[prompt-contract]] and [[audio-transcription-path]].

## A quieter one

[[summarization-request]] calls OpenAI's `responses` API with a `web_search_preview` tool,
so summarising a link can cause OpenAI to fetch a URL from a Slack message. That is the
only path in the repo where external content is pulled in at answer time rather than
crawl time.
