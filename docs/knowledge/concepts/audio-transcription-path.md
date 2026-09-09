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

A user can ask a question as a Slack voice note. If the message carries a file, the bot
transcribes it and uses the transcript as the question, rather than the message text.

## The flow

1. `transcribe(file, openai)` calls `downloadAudio(file.url_private_download, file.id)`.
2. `downloadAudio` fetches the file over `https` with the bot token as a bearer header,
   because Slack's private file URLs require authentication, and streams it to
   `./<file id>.mp4` in the working directory.
3. The saved file is streamed to OpenAI's `whisper-1` with `response_format: 'text'`.
4. The transcript is echoed back in-thread (`You asked: "..."`) so the user can see what
   was heard, then answered normally via [[retrieval-augmented-answering]].

A transcription failure sets `processingError`, and the handler posts the fixed error
string instead of an answer.

## Three things worth flagging

- **The temp file is never deleted.** `downloadAudio` writes `./<file id>.mp4` relative to
  the working directory and nothing removes it. On a long-lived container these accumulate.
- **Errors are dropped silently.** `downloadAudio` returns a promise that only ever
  `resolve`s: there is no `reject`, no `error` handler on the request, and no status check.
  A 404 or an auth failure writes a file containing the error body, which is then sent to
  Whisper.
- **The extension is assumed.** Every download is named `.mp4` regardless of what Slack
  actually sent.

Only the first attachment is considered (`event.files[0]`), and no MIME type check
distinguishes audio from any other file, so attaching a PDF to a DM sends it to Whisper.
Note that the separate [[summarization-request]] path does handle documents properly.

Entirely untested. Part of [[slack-bot-module]].
