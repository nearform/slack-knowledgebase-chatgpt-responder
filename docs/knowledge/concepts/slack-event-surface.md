---
title: Slack event surface
type: concept
tags: [slack, http, security, bolt]
source_paths:
  - packages/slack-bot/src/bot.js
  - packages/slack-bot/src/messageEvents.js
  - slack_manifest.yaml
source_commit: 4a9f973
created: 2026-09-09
updated: 2026-09-09
---

# Slack event surface

## Two routes, two trust levels

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

## `message` is not "a message someone typed"

Slack delivers far more than typed messages on the `message` event, and the difference is
the whole reason `packages/slack-bot/src/messageEvents.js` exists. It holds six pure
predicates, exported so they can be tested without constructing a Bolt app, and the handler
reads as a sequence of calls into them.

The one that matters most is `isPlainUserMessage`
(`packages/slack-bot/src/messageEvents.js:79`). It rejects:

- a **deny list** of subtypes that are never a person asking something
  (`packages/slack-bot/src/messageEvents.js:35-64`), and
- any event carrying `bot_id` or `hidden` at the top level, whatever its subtype.

The deny list has two halves. `bot_message`, `message_changed`, `message_deleted`,
`message_replied`, `tombstone` and `ekm_access_denied` are the bot's or the workspace's own
doing. The rest are notices Slack writes on someone's behalf, whose text reads like "pinned
a message to this conversation", which the model would happily answer as a question.

**A link unfurl on the bot's own answer is the case to understand.** It arrives as
`message_changed` with `hidden: true`, keeps its text at `event.message.text`, and carries
the bot's own `bot_id`, so answering it posts a question nobody asked, reacts to the bot's
own message, and can unfurl again in turn. It fails the deny list, the `bot_id` check and
the `hidden` check independently.

**It is a deny list, not an allow list, on purpose.** We are not confident we know every
subtype Slack may send, and an unrecognised one is better answered, which is what the bot
did before the guard existed, than silently dropped: a wrong answer is visible, no answer
looks like an outage. Subtypes that are still a person speaking are absent by design, so
they are answered: `file_share` (an upload, voice notes included, with the file in
`event.files`), `thread_broadcast` and `me_message`.

## The message handler's shape

`app.event('message', ...)` in `packages/slack-bot/src/bot.js:68`:

1. Return unless `isPlainUserMessage(event)` (`bot.js:77`). **This is the loop guard.**
2. Return unless `carriesQuestion(event)` (`bot.js:83`): typed text, a file, or message
   `attachments`. Nothing to answer and nobody waiting.
3. Add a `thumbsup` reaction as an immediate receipt (`bot.js:106`).
4. Look up the user for their locale, in its own `try`/`catch` so a failed lookup degrades
   to a default locale rather than failing the answer (`bot.js:115-122`).
5. Branch on what arrived: a transcribable file takes the [[audio-transcription-path]]; an
   unreadable attachment or a share with no comment gets a reply asking for a typed
   question; otherwise post a holding message.
6. Answer, or post a fixed error string.

**Steps 1 and 2 sit ahead of the reaction deliberately**, so an event the bot should not
answer leaves no visible trace at all: no reaction, no reply, nothing for a user to notice.

Several calls (`reactions.add`, the holding and interim `postMessage`s) are deliberately not
awaited, so they do not delay the answer. Each still carries a `.catch(console.error)`: the
`WebClient` rejects on `ok: false`, and `already_reacted` on a Slack redelivery would
otherwise be an unhandled rejection, which ends the process and every request in flight on
it.

`carriesQuestion` deliberately asks a different question from "is there something
answerable". A message forwarded with no comment has content in `attachments` but no
question in it, so it passes this guard and then gets a reply asking for one, rather than
being dropped while the sender waits on a DM the bot never even reacted to.

The predicates are covered by `packages/slack-bot/test/messageEvents.test.js`, including a
case that asserts every one of the 27 subtypes on the deny list is rejected. `hasAttachments`
is the one predicate with no `describe` block of its own, reached only through
`carriesQuestion`. The handler is covered by
`packages/slack-bot/test/messageHandler.test.js`, which mocks `@slack/bolt` to capture the
registered handler. See [[test-strategy-module-mocks]].

Part of [[slack-bot-module]]. Answers come from [[retrieval-augmented-answering]].
