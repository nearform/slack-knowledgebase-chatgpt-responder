---
title: Embedding lifecycle and warm start
type: concept
tags: [lifecycle, memoisation, cold-start, pubsub]
source_paths:
  - packages/slack-bot/src/getAnswer.js
  - packages/slack-bot/src/bot.js
  - .github/workflows/deploy-step.yml
source_commit: c4bc5ac
created: 2026-09-09
updated: 2026-09-09
---

# Embedding lifecycle and warm start

The subtlest code in the repo, and the part most likely to be broken by a well-meaning
change. Four behaviours are coupled; **preserve them together**.

## 1. Memoised, self-healing initialisation

`initialize()` stores a single in-flight promise and, on failure, clears it before
rethrowing (`packages/slack-bot/src/getAnswer.js:39`):

```js
initializationPromise = loadEmbeddings().catch(error => {
  initializationPromise = undefined
  throw error
})
```

Two properties fall out of those three lines. Concurrent callers share one load rather
than each starting their own. And a failed load is *forgotten*, so the next question
retries instead of every future caller awaiting a permanently rejected promise. Both are
guarded by
`getAnswer initialization > rejects when the embeddings fail to load, then loads on a retry`.

## 2. Loading starts at import time

The module ends with `initialize().catch(() => {})`
(`packages/slack-bot/src/getAnswer.js:222`). The load begins as soon as the module is
imported, so the first question does not pay for it. The swallowed rejection is
deliberate: the failure is already logged inside `loadEmbeddings`, and behaviour 1 ensures
the next real caller retries. An unhandled rejection here would take the process down.

## 3. `/healthz` as the startup probe

`GET /healthz` awaits `initialize()` and answers 200 `ok` or 503
`embeddings are not loaded` (`packages/slack-bot/src/bot.js:26`). The deploy attaches it
as a Cloud Run **startup probe**, and the source comment explains why: during startup
Cloud Run allocates full CPU, but work outside a request is throttled. Without the probe,
the import-time load in behaviour 2 crawls along on a fraction of a CPU. The probe turns
that background load into request-time work.

This is why the route exists at all, and why it is mounted outside Bolt's receiver
([[slack-event-surface]]).

## 4. Live refresh over Pub/Sub

After a successful load, in non-local environments only, the bot subscribes to
`GCP_EMBEDDING_SUBSCRIPTION` and reloads the data set on an `OBJECT_FINALIZE` message for
the embeddings object. It **acks first, then reloads**, because the reload can take long
enough to look like a failed ack and earn a redelivery. This closes the loop in
[[pipeline-data-flow]] and is why a crawl eventually changes answers without a redeploy.

## The per-process cache file

The download target is `/tmp/embeddings-${process.pid}.csv`. The pid suffix keeps
concurrent processes, tests included, from sharing a file. It also means the file is never
cleaned up, and a container that restarts many times accumulates them in `/tmp`.

Owned by [[slack-bot-module]]. The refresh path is untested.
