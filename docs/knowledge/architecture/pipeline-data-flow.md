---
title: Pipeline data flow
type: architecture
tags: [data-flow, pubsub, gcs, event-driven]
source_paths:
  - packages/crawler/src/crawl.js
  - packages/embeddings-creation/src/create-embeddings.js
  - packages/slack-bot/src/getAnswer.js
  - .github/workflows/deploy-step.yml
source_commit: 633de22
created: 2026-09-09
updated: 2026-09-09
---

# Pipeline data flow

The three services never call each other. **A single Cloud Storage bucket is the message
bus**, and object-finalize events are the messages. This is the central architectural idea
of the repo.

```
Cloud Scheduler
      |
      v
[[crawler-module]] --writes scraped.csv--> ( GCS bucket )
                                                 |
                                     object finalize event
                                                 v
                              [[embeddings-creation-module]]
                                                 |
                                    writes embeddings.csv
                                                 v
                                          ( GCS bucket )
                                                 |
                                  bucket notification -> Pub/Sub topic
                                                 v
                                       [[slack-bot-module]]
                                    (reloads its in-memory data set)
```

## The three couplings

1. **Crawler to embeddings: a storage event.** Writing `scraped.csv` finalizes an object,
   which triggers the `create_embeddings` CloudEvent handler. The handler guards against
   re-triggering on its own output by returning early unless the event's object name
   matches the scraped file name (`packages/embeddings-creation/src/create-embeddings.js:60`).
   Without that guard, writing `embeddings.csv` would trigger another embedding pass in a
   loop.
2. **Embeddings to bot: a Pub/Sub notification.** The bucket has a notification configured
   on `OBJECT_FINALIZE` feeding a topic; the bot subscribes and reloads. See
   [[embedding-lifecycle-and-warm-start]].
3. **Everything to everything: the CSV column contract.** See
   [[csv-as-interchange-format]] and [[embeddings-csv-schema]].

## Consequences worth knowing

- **The pipeline is eventually consistent and one-directional.** Nothing tells the crawler
  whether the bot ever picked up its output; a failure in stage two is silent from stage
  one's perspective.
- **A full re-embed happens on every crawl.** There is no incremental update: the whole
  corpus is re-embedded whenever `scraped.csv` is rewritten. That is the main cost driver.
- **Local runs short-circuit the bus entirely.** See [[local-environment-emulation]] —
  there are no events locally, so the stages are chained by hand with `make` targets.

Depends on [[gcp-deployment-topology]] for the concrete resources.
