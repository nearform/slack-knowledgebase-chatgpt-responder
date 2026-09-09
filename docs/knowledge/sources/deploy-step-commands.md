---
title: Deploy step commands
type: source
tags: [gcp, deployment, raw-extract]
source_paths:
  - .github/workflows/deploy-step.yml
source_commit: c4bc5ac
created: 2026-09-09
updated: 2026-09-09
---

# Deploy step commands

Extract of the provisioning and deploy steps from
`.github/workflows/deploy-step.yml`, in order. Interpretation:
[[gcp-deployment-topology]].

Most create steps are guarded by a `describe` check, so the workflow is broadly safe to
re-run. **One guard is wrong**: "Create bucket notification" checks whether the *bucket*
exists, not whether the notification exists. Because the preceding step just created the
bucket, the `describe` succeeds and the notification is **skipped on a fresh deployment**,
which is the step that wires [[pipeline-data-flow]]'s second coupling. On a re-run against
an existing bucket it is skipped too, so the notification is only ever created if it is
added by hand.

| Step | Command shape |
|---|---|
| Authenticate | `google-github-actions/auth` with Workload Identity Federation |
| Create bucket | `gcloud storage buckets create gs://$BUCKET --location=europe-west1 --public-access-prevention --uniform-bucket-level-access` |
| Bucket notification | `gcloud storage buckets notifications create gs://$BUCKET --topic=$TOPIC --event-types=OBJECT_FINALIZE` |
| Embedding subscription | `gcloud pubsub subscriptions create $SUB --topic=$TOPIC` |
| Crawler image | `gcloud builds submit ./packages/crawler --suppress-logs --pack image=gcr.io/$PROJECT/crawler-job:$GITHUB_SHA` |
| Crawler job | `gcloud beta run jobs create\|update crawler-job --region europe-west1` |
| Scheduler | `gcloud scheduler jobs create\|update http crawl-schedule-job --location=europe-west1` |
| Secrets | written to GCP Secret Manager |
| Bot | `gcloud beta functions deploy slackbot --memory=512MB --cpu=1 --region=europe-west1` |
| Bot startup probe | `gcloud run services update slackbot --region=europe-west1` |
| Embeddings function | `gcloud functions deploy embedding-creation --memory=2GiB --region=europe-west1` |

The probe is a separate step because, per the comment in the workflow,
`gcloud functions deploy` cannot express a startup probe. Its purpose is explained in
[[embedding-lifecycle-and-warm-start]].

Triggered by `production-deploy.yml` on a published release or manual dispatch, which also
passes `MAX_CONTEXT_TOKENS` through from a repository variable
([[context-token-budget]]).
