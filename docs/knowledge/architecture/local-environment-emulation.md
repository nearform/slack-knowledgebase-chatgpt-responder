---
title: Local environment emulation
type: architecture
tags: [local-dev, testing, gcs]
source_paths:
  - packages/crawler/src/utils.js
  - packages/embeddings-creation/src/utils.js
  - packages/slack-bot/src/utils.js
  - packages/slack-bot/src/env.js
  - Makefile
source_commit: 633de22
created: 2026-09-09
updated: 2026-09-10
---

# Local environment emulation

Every cloud read and write in the repo goes through a helper that checks one flag:

```js
export const isLocalEnvironment = Boolean(process.env.IS_LOCAL_ENVIRONMENT)
```

When it is set, `download` and `upload` become `fs.copyFile` against a `.cache/` directory
at the monorepo root, located with `@manypkg/find-root`. When it is not, they talk to
Cloud Storage. See [[shared-storage-utils]] for the helpers themselves.

## Why this design earns its keep

It means **the entire pipeline runs on a laptop with no GCP access**, and the `make`
targets chain the stages by hand in place of the storage events described in
[[pipeline-data-flow]]:

```
make crawl              # writes .cache/scraped.csv
make embeddings-start   # serve the function on :3002
make embeddings         # POST a synthetic finalize CloudEvent at it
make bot-start          # serve the bot on :3003
make bot-expose         # ngrok, so Slack can reach it
```

The `make embeddings` target is worth reading: it hand-crafts the CloudEvent headers
(`ce-id`, `ce-type: google.cloud.storage.object.v1.finalized`, and so on) that Cloud
Storage would otherwise send. That is the local stand-in for the event bus.

## The trap in it

`isLocalEnvironment` is evaluated **once, when the module is imported**, not per call.
Setting or clearing the environment variable after import has no effect. This shapes the
test suite: `packages/slack-bot/test/download.test.js` deletes the variable at the top of
the file, before importing `utils.js`, because that is the only way to reach the bucket
branch. It lives in a file of its own for two reasons: the deletion is process-wide, and
`mock.module` registers a specifier once per process. See [[test-strategy-module-mocks]].

Note also that `IS_LOCAL_ENVIRONMENT` is truthy for *any* non-empty value, `"false"`
included.

The flag has one other job: `packages/slack-bot/src/env.js` reads it with the same
`Boolean` semantics, off its own `env` argument rather than by importing `utils.js`, and
requires `GCP_PROJECT_ID` and `GCP_EMBEDDING_SUBSCRIPTION` only when it is falsy. Those
two exist solely to name the Pub/Sub subscription a local run never creates, so requiring
them unconditionally would stop `make bot-start` for a developer who has no Pub/Sub
configured at all. See [[external-integrations]].
