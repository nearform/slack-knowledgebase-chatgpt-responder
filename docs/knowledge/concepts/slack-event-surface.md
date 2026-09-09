---
title: Slack event surface
type: concept
tags: [slack, http, security, bolt]
source_paths:
  - packages/slack-bot/src/bot.js
  - slack_manifest.yaml
source_commit: c4bc5ac
created: 2026-09-09
updated: 2026-09-09
---

# Slack event surface

## Three routes, two trust levels

| Route | Mounted on | Verified |
|---|---|---|
| `POST /slack/events` | Bolt's `ExpressReceiver` | yes, against `SLACK_SIGNING_SECRET` |
| `GET /healthz` | `expressReceiver.app` directly | **no** |

The `/healthz` route is registered on the underlying Express app rather than through Bolt,
which is precisely why no signature check applies. That is intentional (Cloud Run's probe
cannot sign requests) and is why the route must never carry anything sensitive. Its purpose
is explained in [[embedding-lifecycle-and-warm-start]].

## HTTP, not Socket Mode

The README is emphatic about this: the bot uses the HTTP receiver because it deploys as a
function, and Socket Mode needs a persistent outbound connection that a
scale-to-zero function cannot hold. Consequence: Slack needs a reachable public URL, which
is what `make bot-expose` (ngrok) provides locally.

## What it listens to

`slack_manifest.yaml` declares the OAuth scopes and subscribes the bot to `message.im`, so
**direct messages only**. The `summarize` shortcut is registered in code
(`packages/slack-bot/src/summarize.js:20`), not in the manifest, which is worth knowing
before hunting for it there.

## The message handler's shape

`app.event('message', ...)` in `packages/slack-bot/src/bot.js:41`:

1. Return immediately on the `bot_message` subtype. **This is the loop guard**: the bot's
   own replies are messages too.
2. Add a `thumbsup` reaction as an immediate receipt.
3. Look up the user for their locale, in its own `try`/`catch` so a failed lookup degrades
   to a default locale rather than failing the answer.
4. If a file is attached, take the [[audio-transcription-path]]; otherwise post a holding
   message.
5. Answer, or post a fixed error string.

Several of those calls (`reactions.add`, the holding `postMessage`) are deliberately not
awaited, so they do not delay the answer.

Note the handler is entirely untested. See [[test-strategy-module-mocks]].

Part of [[slack-bot-module]]. Answers come from [[retrieval-augmented-answering]].
