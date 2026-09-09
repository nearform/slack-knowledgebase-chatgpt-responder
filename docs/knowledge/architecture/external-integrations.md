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

## No credential is validated before use

Every secret in the table above is read from `process.env` and handed straight to a
constructor, with no null check, no empty-string guard and no startup assertion:

| Credential | Read at |
|---|---|
| `SLACK_SIGNING_SECRET` | `packages/slack-bot/src/bot.js:11` |
| `SLACK_BOT_TOKEN` | `packages/slack-bot/src/bot.js:15`, and again in `utils.js:58` and `summarize.js:57` |
| `OPENAI_API_KEY` | `packages/slack-bot/src/bot.js:36`, `packages/embeddings-creation/src/create-embeddings.js:14` |
| `NOTION_TOKEN` | `packages/crawler/src/notion.js:6` |

The GCP bucket and project names are read the same way at module scope
(`packages/slack-bot/src/getAnswer.js:21-22`).

**So a misconfigured deployment starts cleanly and fails later**, at the first request or
the first bucket call, with whatever opaque error the client library raises rather than a
message naming the missing variable. On a Cloud function that means the failure surfaces to
a user asking a question, not to whoever deployed it.

`MAX_CONTEXT_TOKENS` is the **only** environment variable the codebase validates, via
`parsePositiveTokenCount` ([[context-token-budget]]) — and that exists because a bad value
silently produced a zero-token context, not because config validation was adopted as a
pattern. A single validate-on-startup function called before the constructors would turn
every one of these into a deploy-time failure. There is no such function today.

## The data-egress boundary worth being deliberate about

Crawled Notion content is internal Nearform material. Every chunk is sent to OpenAI at
embedding time, and at least once: each embedding call is wrapped in `backOff` with up to
five attempts, so a transient or ambiguous failure re-transmits the same content. After
that, each question sends only the nearest chunks that fit [[context-token-budget]], not
the whole corpus. The corpus also lands on disk as
`scraped.csv`, `embeddings.csv` and `.cache/` contents, all git-ignored. Treat those files
as internal data.

Which model receives it is pinned in code rather than configured: `text-embedding-ada-002`
for vectors, `gpt-4.1` for answers and summaries, `whisper-1` for transcription. See
[[prompt-contract]] and [[audio-transcription-path]].

## A quieter one

[[summarization-request]] calls OpenAI's `responses` API with a `web_search_preview` tool,
so summarising a link can cause OpenAI to fetch a URL from a Slack message. That is the
only path in the repo where external content is pulled in at answer time rather than
crawl time.
