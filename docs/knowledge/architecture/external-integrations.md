---
title: External integrations
type: architecture
tags: [integrations, trust-boundaries, secrets]
source_paths:
  - packages/crawler/src/env.js
  - packages/crawler/src/notion.js
  - packages/slack-bot/src/bot.js
  - packages/slack-bot/src/env.js
  - packages/slack-bot/src/getAnswer.js
  - packages/embeddings-creation/src/create-embeddings.js
  - packages/embeddings-creation/src/env.js
source_commit: 4a9f973
created: 2026-09-09
updated: 2026-09-10
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

## Every credential is checked at startup

Each secret in the table above is still read from `process.env` and handed straight to a
constructor, at module scope:

| Credential | Read at |
|---|---|
| `SLACK_SIGNING_SECRET` | `packages/slack-bot/src/bot.js:17` |
| `SLACK_BOT_TOKEN` | `packages/slack-bot/src/bot.js:21`, and again in `utils.js:119` and `summarize.js:57` |
| `OPENAI_API_KEY` | `packages/slack-bot/src/bot.js:42`, `packages/embeddings-creation/src/create-embeddings.js:14` |
| `NOTION_TOKEN` | `packages/crawler/src/notion.js:6` |

The GCP bucket and project names are read the same way at module scope
(`packages/slack-bot/src/getAnswer.js:21-22`).

What changed is that nothing gets that far with a hole in the environment. Each package
has a `src/env.js` exporting `validateEnv(env = process.env)`, and each entry point calls
it as its first act:

| Entry point | Requires |
|---|---|
| `packages/crawler/src/index.js` | `NOTION_TOKEN`, `GCP_STORAGE_BUCKET_NAME`, `GCP_STORAGE_SCRAPED_FILE_NAME` |
| `packages/embeddings-creation/src/index.js` | `OPENAI_API_KEY`, `GCP_STORAGE_SCRAPED_FILE_NAME`, `GCP_STORAGE_EMBEDDING_FILE_NAME` |
| `packages/slack-bot/src/index.js`, `dev.js` | `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`, `OPENAI_API_KEY`, `GCP_STORAGE_BUCKET_NAME`, `GCP_STORAGE_EMBEDDING_FILE_NAME`, plus `GCP_PROJECT_ID` and `GCP_EMBEDDING_SUBSCRIPTION` unless `IS_LOCAL_ENVIRONMENT` is set |

The sets come from `.github/workflows/deploy-step.yml` ([[deploy-step-commands]]) rather
than from the README, which is why the bucket is absent from embeddings-creation: that one
arrives on the CloudEvent, not from the environment. The bot's two Pub/Sub variables are
conditional because they exist only to name the subscription that
[[embedding-lifecycle-and-warm-start]] skips locally.

Absent, empty and whitespace-only all count as missing. Every missing name is collected
and reported in one error, so a fresh deployment is told about all of its holes at once
rather than one per redeploy, and no value ever reaches the message because these are
secrets.

**The ordering is the whole trick.** ESM evaluates an imported module's body before its
importer's, so a `validateEnv()` sitting below a static `import` of `bot.js` would run
after the Bolt receiver, the Bolt app and the OpenAI client had already been built. Each
entry point therefore validates and then `await import()`s the app module. The crawler is
the sharpest case: `crawl()` runs the entire Notion crawl in `fetchData()` and only uses
the storage variables afterwards (`packages/crawler/src/crawl.js:11-14`), so before this a
missing bucket name burned a complete crawl before failing. That ordering is pinned by
`packages/slack-bot/test/startupValidation.test.js` and
`packages/crawler/test/startupValidation.test.js`, which assert the entry-point import
rejects and that no client was constructed.

`MAX_CONTEXT_TOKENS` is deliberately outside all of this: it is optional with a default,
and `parsePositiveTokenCount` ([[context-token-budget]]) already handles it.

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
