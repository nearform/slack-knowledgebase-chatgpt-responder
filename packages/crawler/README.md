# @nearform/knowledge-base-responder-crawler

## Notion setup

Create a new notion integration and add it to a section. Please refer to https://www.notion.so/my-integrations.

## Environment variables

Head to https://www.notion.so/my-integrations/ and select your. Then copy/paste the following values in an `.env` file:

| Env var                   |                                |
| ------------------------- | ------------------------------ |
| `NOTION_TOKEN`            | secret_y0uR_1n73gr4710n_S3cr37 |
| `GCP_STORAGE_BUCKET_NAME` | your_bucket_name               |
| `GCP_STORAGE_FILE_NAME`   | fallback on "scraped.csv"      |

## Google Cloud

Install google cloud CLI to work on your local machine from [here](https://cloud.google.com/sdk/docs/install).
Once the cli is installed, perform the login using `gcloud auth login`

### Deploying

**Enable cloudresourcemanager.googleapis.com**
`gcloud services enable cloudresourcemanager.googleapis.com --project $PROJECT_ID`

**Create the topic (one-time operation):**
`gcloud pubsub topics create crawler-topic`

**Create a cron job (one-time operation):**

```
gcloud scheduler jobs create pubsub crawl-job \
  --schedule="* * 1 * *" \
  --topic=projects/slack-kb-chatgpt-responder/topics/crawler-topic \
  --message-body="start_crawl"\
  --project=slack-kb-chatgpt-responder \
  --location=europe-west1
```

**Deploy (from inside the `crawler` folder):**

```
gcloud functions deploy crawl \
--gen2 \
--runtime nodejs18 \
--region europe-west1 \
--entry-point crawl \
--trigger-topic crawler-topic \
--set-env-vars NOTION_TOKEN=notion_secret,GCP_STORAGE_BUCKET_NAME=bucket-name,GCP_STORAGE_FILE_NAME=scraped.csv
```

**👆 This is done automatically each time a branch is merged on master**
