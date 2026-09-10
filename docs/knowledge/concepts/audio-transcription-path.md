---
title: Audio transcription path
type: concept
tags: [whisper, slack-files, openai]
source_paths:
  - packages/slack-bot/src/utils.js
  - packages/slack-bot/src/messageEvents.js
  - packages/slack-bot/src/bot.js
source_commit: 4a9f973
created: 2026-09-09
updated: 2026-09-09
---

# Audio transcription path

A user can ask a question as a Slack voice note. If the message carries a file the bot can
transcribe, the transcript becomes the question, and the bot echoes back what it heard
before answering. The path works end to end and is covered by tests.

It is worth reading as two decisions rather than one flow: **which** file to transcribe,
which lives in [[slack-event-surface]]'s predicates, and **how** to fetch and read it,
which is the rest of this note.

## Choosing the file

`isTranscribableFile` (`packages/slack-bot/src/messageEvents.js:131`) requires both halves:

- an `audio/` mimetype, **or** the `slack_audio` subtype Slack marks its own voice notes
  with, and
- a non-empty `url_private_download`.

Both are load-bearing. Without the audio check every attachment went to OpenAI's audio
endpoint, so a PDF or a screenshot of client content was uploaded for nothing and a screen
recording's soundtrack was answered instead of the question typed alongside it. Without the
URL check `new URL(undefined)` threw a `TypeError` on Slack Connect and restricted-file
stubs, `hidden_by_limit` files and external-mode files, all of which surfaced to the user as
a generic internal failure.

The handler takes the first *transcribable* file rather than the first file
(`packages/slack-bot/src/bot.js:130`), so a document uploaded alongside a voice note does
not hide the recording.

## The flow

1. `transcribe(file, openai)` (`packages/slack-bot/src/utils.js:208`) calls
   `downloadAudio(file.url_private_download, file.id)`.
2. `downloadAudio` (`packages/slack-bot/src/utils.js:99`) fetches the file over `https` with
   the bot token as a bearer header, because Slack's private file URLs require
   authentication, and streams it to `<file id>-<uuid>.mp4` under `os.tmpdir()`.
3. The saved file is streamed to `whisper-1` with `response_format: 'text'`, and the result
   is read through `transcriptionText` (`packages/slack-bot/src/utils.js:190`).
4. `transcribe` destroys the read stream and removes the scratch file in a `finally`
   (`packages/slack-bot/src/utils.js:225-231`), so a rejected transcription leaks nothing
   either.
5. With words heard, `questionInput` becomes the transcript and the bot posts
   `You asked: "..."` in-thread (`packages/slack-bot/src/bot.js:141-149`) before
   [[retrieval-augmented-answering]] runs on it.

## Reading the response through one helper

`transcriptionText` exists because the two SDK response shapes are easy to get wrong.
With `response_format: 'text'` the `openai` client resolves to a **bare string**, so
reading `.text` off it yields `undefined`; other formats resolve to an object carrying
`text`. The helper accepts either, and anything else gives the empty string.

It also **trims**, which is what makes the caller's branching honest: Whisper's text format
newline-terminates its output and returns only whitespace for audio with no speech, and a
whitespace-only string is truthy. After trimming, the empty string means exactly "no words
were heard", and `bot.js` branches on it directly. Keep the normalisation in the helper: it
is there so changing the format cannot quietly return nothing again.

## Failure is explicit, and the scratch file never outlives the attempt

`downloadAudio` rejects on every failure, and each rejection removes the partial file
before rethrowing:

| Failure | Handled by |
|---|---|
| The request never connects | `request.on('error', reject)` |
| The response breaks part way through | `stream.pipeline`'s callback (`utils.js:142`) |
| The destination cannot be written | the same `pipeline` callback |
| The response stalls | a 30s inactivity `timeout` that destroys the request (`utils.js:59`) |
| A non-2xx answer, such as an expired download URL's error body | the status check at `utils.js:125`, which drains and abandons the response |

Two details are worth not undoing. `stream.pipeline` rather than `pipe`, because piping
does not tear the destination down when the source fails, which left a partial file and an
open write handle. And a request `timeout` option is required for the `'timeout'` event to
fire at all; without it a Slack connection that accepted and then sent nothing left the
handler awaiting a promise that could never settle.

The scratch file lives under `os.tmpdir()` with a `randomUUID()` suffix
(`packages/slack-bot/src/utils.js:107`) for two separate reasons. A Cloud Run instance's
working directory is an in-memory filesystem charged against the memory limit, and the
service runs `--min-instances=1`, so a file left behind per upload grows until the instance
is OOM-killed. The random suffix keeps two runs for the same Slack file apart, because Slack
redelivers an event it has not seen a 200 for, and on one shared destination the two
downloads overwrote each other.

## What the user sees when it does not work

None of these reach the generic "please try again" error, deliberately:

- **No words heard, nothing typed.** The bot says it could not make out any words and
  stops (`packages/slack-bot/src/bot.js:171-183`). Nothing went wrong on our side.
- **No words heard, or the transcription threw, with a question typed alongside.** The
  typed question is answered and the user is told the attachment was not read
  (`packages/slack-bot/src/bot.js:225-236`). The file failed, not the question.
- **A file we will not transcribe, nothing typed.** The bot asks the user to type the
  question (`packages/slack-bot/src/bot.js:184-202`). Nothing is sent to OpenAI.

The generic error stands in exactly one transcription case: the transcription threw and
nothing was typed to fall back on (`packages/slack-bot/src/bot.js:167`).

## Still worth knowing

- **The extension is assumed.** Every download is named `.mp4` regardless of what Slack
  actually sent. Whisper sniffs the content, so this has not bitten, but the name is not
  evidence of the format.
- **Documents are not read here at all.** The separate [[summarization-request]] path is
  where files are read.

Covered by `packages/slack-bot/test/transcribe.test.js` (`downloadAudio`, `transcribe` and
`transcriptionText`), `packages/slack-bot/test/messageEvents.test.js`
(`isTranscribableFile`) and `packages/slack-bot/test/messageHandler.test.js` (every branch
above). Part of [[slack-bot-module]].
