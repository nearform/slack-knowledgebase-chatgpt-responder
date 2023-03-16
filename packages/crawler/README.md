# @nearform/knowledge-base-responder-crawler

## Notion setup

Create a new notion integration and add it to a section. Please refer to https://www.notion.so/my-integrations.

## Environment variables

Head to https://www.notion.so/my-integrations/ and select your. Then copy/paste the following values in an `.env` file:

| Env var                  |                                |
| ------------------------ | ------------------------------ |
| `NOTION_TOKEN`           | secret_y0uR_1n73gr4710n_S3cr37 |
| `GC_STORAGE_BUCKET_NAME` | your_bucket_name               |
| `FILE_NAME`              | fallback on "scraped.csv"      |

## Google Cloud

Install google cloud CLI to work on your local machine from [here](https://cloud.google.com/sdk/docs/install).
Once the cli is installed, perform the login using `gcloud auth login`

### Deploying

**Create the topic (one-time operation):**
`gcloud pubsub topics create crawler-topic`

**Deploy (from inside the `crawler` folder):**

```
gcloud functions deploy crawl \
--gen2 \
--runtime nodejs18 \
--region europe-west4 \
--entry-point crawl \
--trigger-topic crawler-topic \
--set-env-vars NOTION_TOKEN=notion_secret,GC_STORAGE_BUCKET_NAME=bucket-name,FILE_NAME=scraped.csv
```

Once the function is deployed, you can manually publish a message to the topic using:
`gcloud pubsub topics publish crawler-topic --message="start_crawl"`

**TODO Create a cron job:**

```
gcloud scheduler jobs create pubsub JOB \
--location=LOCATION \
--schedule=SCHEDULE \
--topic=TOPIC
```
