# @nearform/knowledge-base-responder-crawler

## Notion setup

Create a new notion integration and add it to a section. Please refer to https://www.notion.so/my-integrations.

## Environment variables

Head to https://www.notion.so/my-integrations/ and select your. Then copy/paste the following values in an `.env` file:

| Env var                         |                                |
| ------------------------------- | ------------------------------ |
| `NOTION_TOKEN`                  | secret_y0uR_1n73gr4710n_S3cr37 |
| `GCP_STORAGE_BUCKET_NAME`       | your_bucket_name               |
| `GCP_STORAGE_SCRAPED_FILE_NAME` | fallback on "scraped.csv"      |

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
--set-env-vars NOTION_TOKEN=notion_secret,GCP_STORAGE_BUCKET_NAME=bucket-name,GCP_STORAGE_SCRAPED_FILE_NAME=scraped.csv
```

**👆 This is done automatically each time a branch is merged on master**

### Local testing

Once you started the project using `npm start`, you can run:

```
curl localhost:8080 \
  -X POST \
  -H "Content-Type: application/json" \
  -H "ce-id: 123451234512345" \
  -H "ce-specversion: 1.0" \
  -H "ce-time: 2020-01-02T12:34:56.789Z" \
  -H "ce-type: google.cloud.pubsub.topic.v1.messagePublished" \
  -H "ce-source: //pubsub.googleapis.com/projects/slack-kb-chatgpt-responder/topics/crawler-topic" \
  -d '{
        "message": {
          "data": "c3RhcnRfY3Jhd2w="
        }
      }'
```

If you are not logged in yet, use `gcloud auth application-default login`.
Note that `c3RhcnRfY3Jhd2w=`is `start_crawl` base64 encoded.
