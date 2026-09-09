---
title: Audio transcription path
type: concept
tags: [whisper, slack-files, openai]
source_paths:
  - packages/slack-bot/src/utils.js
  - packages/slack-bot/src/bot.js
source_commit: c4bc5ac
created: 2026-09-09
updated: 2026-09-09
---

# Audio transcription path

A user can ask a question as a Slack voice note. The intent is that if the message carries
a file, the bot transcribes it and uses the transcript as the question, rather than the
message text.

**As written the path is broken end to end: `transcribe` returns `undefined` on every
call.** Read the next section before touching anything else here: the defects flagged
further down are all real, but fixing every one of them leaves the path returning
nothing.

## The flow

1. `transcribe(file, openai)` calls `downloadAudio(file.url_private_download, file.id)`.
2. `downloadAudio` fetches the file over `https` with the bot token as a bearer header,
   because Slack's private file URLs require authentication, and streams it to
   `./<file id>.mp4` in the working directory.
3. The saved file is streamed to OpenAI's `whisper-1` with `response_format: 'text'`, and
   `transcribe` returns `transcribe.text` off the result
   (`packages/slack-bot/src/utils.js:78-83`).
4. Nothing further happens. Step 3 yields `undefined`, so the transcript is never echoed
   back in-thread (`You asked: "..."`), the question is never replaced, and
   [[retrieval-augmented-answering]] runs against whatever `event.text` held, which for a
   voice note is usually the empty string.

## The transcript is never returned

In `openai` 7.10.0 the `create` overload matching `response_format: 'text'` is typed
`create(body: TranscriptionCreateParamsNonStreaming<'srt' | 'vtt' | 'text'>, options?:
RequestOptions): APIPromise<string>`
(`node_modules/openai/resources/audio/transcriptions.d.ts:29`). The call resolves to a bare
string, not an object, so `packages/slack-bot/src/utils.js:83` reads `.text` off a string
and gets `undefined` every time.

Downstream, `if (transcribedResponse)` at `packages/slack-bot/src/bot.js:73` is therefore
always false: no echo is posted and `questionInput` silently stays as `event.text`. The fix
is either `response_format: 'json'`, which makes `.text` correct, or returning the string
directly.

Note what this failure mode is **not**. Nothing throws, so `processingError` is never set
and the fixed error string is never posted: the user gets an answer synthesised from an
empty question instead of an error. `processingError` is still set, and the fixed error
string still posted instead of an answer, when `transcribe` genuinely throws.

## Four more things worth flagging

- **The temp file is never deleted.** `downloadAudio` writes `./<file id>.mp4` relative to
  the working directory and nothing removes it. On a long-lived container these accumulate.
- **Errors are unhandled, not swallowed.** `downloadAudio` returns a promise that only
  ever `resolve`s: there is no `reject`, and no `error` listener on the request or the
  streams. A transport or stream failure therefore emits an `error` event with no
  listener, which **throws and can take the process down**, rather than degrading quietly.
  Separately, there is no status check, so a 404 or an auth failure writes the error body
  to disk and sends it to Whisper. Do not preserve either behaviour on the assumption that
  it fails softly.
- **The extension is assumed.** Every download is named `.mp4` regardless of what Slack
  actually sent.
- **The download drops the query string.** `downloadAudio` rebuilds the request from
  `u.hostname` and `u.pathname` only (`packages/slack-bot/src/utils.js:53-60`) and never
  passes `u.search`. Slack `url_private_download` URLs can carry query parameters, so that
  auth or query state is dropped and the download can fail.

Only the first attachment is considered (`event.files[0]`), and no MIME type check
distinguishes audio from any other file, so attaching a PDF to a DM sends it to Whisper.
Note that the separate [[summarization-request]] path does handle documents properly.

Entirely untested. Part of [[slack-bot-module]].
