---
title: Shared storage utils
type: module
tags: [duplication, gcs, dry]
source_paths:
  - packages/crawler/src/utils.js
  - packages/embeddings-creation/src/utils.js
  - packages/slack-bot/src/utils.js
source_commit: 4a9f973
created: 2026-09-09
updated: 2026-09-09
---

# Shared storage utils

Three packages, three `src/utils.js` files, near-identical contents. This is the most
visible apparent DRY violation in the repo, and it is a deliberate trade.

## What each one carries

| Helper | crawler | embeddings-creation | slack-bot |
|---|---|---|---|
| `isLocalEnvironment` | yes | yes | yes |
| `upload` | yes | yes | no |
| `download` | no | yes | yes |
| `createCsv` | yes | yes | no |
| `parseCsv` | no | yes | yes |
| `distancesFromEmbeddings` | no | no | yes |
| `downloadAudio`, `transcribe`, `transcriptionText` | no | no | yes |

Each package carries only the direction it needs. The crawler only ever writes; the bot
only ever reads.

## Why not extract a shared package

Each service deploys independently, and two of the three deploy as Cloud functions built
from their own directory (`gcloud builds submit ./packages/crawler`,
`gcloud functions deploy` per package). A shared workspace dependency would have to be
resolvable at build time inside each deployment artifact, which is exactly the packaging
problem the duplication avoids. The duplicated surface is about 30 lines of thin wrappers
with no business logic, so the cost of divergence is low. Note that most of
`slack-bot`'s `utils.js` is **not** duplicated: the audio helpers exist only there
([[audio-transcription-path]]) and are the bulk of the file.

**Before extracting a shared package, check the deploy workflow first.** This is the
constraint that makes the obvious refactor a bad idea.

## The one place they genuinely differ

`slack-bot`'s `download` writes to a caller-supplied `destination`, and its test asserts
specifically that the destination is *not* the bucket file name. The other two are
symmetric wrappers. The bot needs the distinction because its local cache file is
per-process: see [[embedding-lifecycle-and-warm-start]].

All three implement the same flag-based branch described in
[[local-environment-emulation]].
