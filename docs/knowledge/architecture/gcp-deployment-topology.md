---
title: GCP deployment topology
type: architecture
tags: [gcp, cloud-run, deployment, ci]
source_paths:
  - .github/workflows/deploy-step.yml
  - .github/workflows/production-deploy.yml
  - .github/workflows/ci.yml
source_commit: c4bc5ac
created: 2026-09-09
updated: 2026-09-09
---

# GCP deployment topology

One GitHub Actions workflow, `.github/workflows/deploy-step.yml`, provisions and deploys
**most** of this. It is the best description of the runtime environment, but it is not
self-contained: it never creates the Pub/Sub topic, and its bucket-notification step is
guarded so that it never runs. Both are manual prerequisites on a fresh project. Extracted
commands and the full caveats: [[deploy-step-commands]].

Storage, compute and the scheduler live in **`europe-west1`**. Pub/Sub topics and
subscriptions and Secret Manager secrets are **global**: they take no region, which is why
the subscription create is the one provisioning call in the workflow with no `--region` or
`--location` flag.

| Resource | Kind | Notes |
|---|---|---|
| the content bucket | GCS | created with `--public-access-prevention` and uniform bucket-level access |
| bucket notification | GCS to Pub/Sub | on `OBJECT_FINALIZE`, feeds the embeddings topic |
| embeddings subscription | Pub/Sub | what [[slack-bot-module]] listens to |
| `crawler-job` | Cloud Run job | image built with `gcloud builds submit --pack` |
| `crawl-schedule-job` | Cloud Scheduler | triggers the crawler job over HTTP |
| `embedding-creation` | Cloud function | `--memory=2GiB`, CloudEvent signature |
| `slackbot` | Cloud function | `--memory=512MB --cpu=1`, HTTP |
| secrets | Secret Manager | populated by the workflow from repository secrets |

## Two details that are easy to miss

**The startup probe is configured separately.** `gcloud functions deploy` cannot express a
startup probe, so the workflow deploys `slackbot` and then issues a second
`gcloud run services update` to attach an HTTP startup probe on `/healthz`. This is not
cosmetic: it is what keeps full CPU allocated while the embeddings load, instead of the
load being throttled as background work. See [[embedding-lifecycle-and-warm-start]].

**Authentication uses Workload Identity Federation.** There is no service-account key file
anywhere in the repo or in CI, which is why the security notes list no key material to
protect.

## CI, separately

`.github/workflows/ci.yml` runs lint and tests **per workspace** as three parallel jobs,
then auto-merges Dependabot PRs. Note that CI never runs the root `npm run lint`, only the
per-workspace one. Releases are cut manually rather than from commit messages:
`.github/workflows/release.yml` is a `workflow_dispatch` with an explicit `semver` input
(`patch`, `minor` or `major`, default `patch`) that runs
`nearform-actions/optic-release-automation-action@v4`, so a human picks the version. A
published release is what triggers the production deploy.

Part of [[project-overview]].
