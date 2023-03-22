# slack-knowledgebase-chatgpt-responder

This project is composed of 3 components, which communicate with each other. Everything is hosted on Google Cloud Platform.

1. **Crawler**: A function which crawls once a day data from Notion (The NearForm way section), and stores a csv file with the relevant page content
2. **Embeddings creation**: A function which generates an embeddings file based on **Crawler**'s csv output and using OpenAI Apis. The embeddings file is meant to create a context for our AI.
3. **Slack bot** A function that reads the embeddings files and uses OpenAI APIs to generate Slack bot-compliant answers about NearForm knowledge base.

![alt text](./assets/schema.png 'Schema')

We used [this](https://github.com/openai/openai-cookbook/tree/main/apps/web-crawl-q-and-a) tutorial to write the OpenAI part.

## Notion setup

Create a new notion integration and add it to a section. Please refer to https://www.notion.so/my-integrations.
Click on "New Integration", set `slack-kb-chatgpt-responder` as name. Under the "Capabilities" section, make sure that all the "Content Capabilities" are checked. No "Comment Capabilities" are required, same for the "User Capabilities".

To add the new integration, access to "The NearForm way" section in Notion, then click on the 3-dots icon in the top-right corner of the page and scroll the menu to reach the "Connections" section, from which you can click on "Add connection" to add the previously created one.

## Google Cloud

Install google cloud CLI to work on your local machine from [here](https://cloud.google.com/sdk/docs/install).
Once the cli is installed, perform the login using `gcloud auth login`

Create the project and enable all the required pieces: https://cloud.google.com/eventarc/docs/run/create-trigger-storage-gcloud#before-you-begin

# crawler

## Environment variables

Head to https://www.notion.so/my-integrations/ and select your. Then copy/paste the following values in an `.env` file:

| Env var                         |                                |
| ------------------------------- | ------------------------------ |
| `NOTION_TOKEN`                  | secret_y0uR_1n73gr4710n_S3cr37 |
| `GCP_STORAGE_BUCKET_NAME`       | your_bucket_name               |
| `GCP_STORAGE_SCRAPED_FILE_NAME` | fallback on "scraped.csv"      |

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
See .github/workflows/deploy-step.yml
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

# embeddings-creation

### Environment variables

Add the following values in `.env` (for local environment) and `.env.yaml` (for gcloud) file:

| Env var                           | Where is Slack App admin page        |
| --------------------------------- | ------------------------------------ |
| `OPENAI_API_KEY`                  | OpenAI API key                       |
| `GCP_STORAGE_SCRAPED_FILE_NAME`   | Scraped data file name on the bucket |
| `GCP_STORAGE_EMBEDDING_FILE_NAME` | Embeddings file name on the bucket   |

## Deployment

```
See .github/workflows/deploy-step.yml
```

# slack-bot

Slack bots configured to respond to direct messages with NearForm knowledge base answers retrieved via chatGPT APIs.

## Installation

### Slack application setup

1. Create a new slack workspace and a new Slack application or use an existing one.
2. Please refer to https://slack.dev/bolt-python/tutorial/getting-started-http to have a general understanding of how `bolt-python` works and how to setup a Slack app to interact with the bot.
3. Enable bot's direct messages in your APP page in `api.slack.com/apps/[id] > App Home > Show Tabs > Allow users to send Slash commands and messages from the messages tab`
4. Copy paste the following JML configuration in `api.slack.com/apps/[id] > App Manifest` (you'll have to replace `<slack-bot-url>` with the actual slack-bot production url)

```yml
display_information:
  name: NearForm Know-It-All
  description: A chatbot that can answer questions on thenearformway.com content
  background_color: '#2165e3'
features:
  bot_user:
    display_name: NearForm Know-It-All
    always_online: true
oauth_config:
  scopes:
    bot:
      - chat:write
      - im:history
settings:
  event_subscriptions:
    request_url: <slack-bot-url>
    bot_events:
      - message.im
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
```

> IMPORTANT NOTE: **we are NOT leveraging the Slack's web socket mode** but using the good old **HTTP setup**. This is necessary since the bot is meant to be deployed as a lambda.

Once the BOT is deployed (or executed locally), you'll have to provide your Slack app configuration with bot's public URL (see docs below).

### Environment variables

Add the following values in `.env` (for local environment) and `.env.yaml` (for gcloud) file:

| Env var                           | Where is Slack App admin page                                              |
| --------------------------------- | -------------------------------------------------------------------------- |
| `GCP_PROJECT_NAME`                | GCP Project name                                                           |
| `GCP_EMBEDDING_SUBSCRIPTION`      | Embedding file update subscription name                                    |
| `GCP_STORAGE_BUCKET_NAME`         | GCP bucket name hosting embeddings file                                    |
| `GCP_STORAGE_EMBEDDING_FILE_NAME` | Embeddings file name on the bucket                                         |
| `SLACK_SIGNING_SECRET`            | `api.slack.com/apps/[id]` > `Basic information` > `Signing Secret`         |
| `SLACK_BOT_TOKEN`                 | `api.slack.com/apps/[id]` > `OAuth & Permissions` > `Bot User OAuth Token` |
| `OPENAI_API_KEY`                  | Open API key                                                               |
| `LOCAL_PORT`                      | Local port the bot listens to (dev only)                                   |
| `GOOGLE_CLOUD_PROJECT`            | Set the same value as `GCP_PROJECT_NAME`, (dev only)                       |

## Local development

### Google cloud provider setup

Login to GCP with `gcloud auth application-default login`.

### Python setup

- Install virtual environment with `python -m venv .venv`
- Activate the environment with `source .venv/bin/activate`
- Install project dependencies with `pip install -r requirements.txt`
- Run the project with `functions-framework --target=slack_bot` (default port 8080, check (here)[https://cloud.google.com/functions/docs/running/function-frameworks#functions-local-ff-install-python] for customize it)

### Slack setup

Since Bolt runs on the local host and Slack needs a public URL to reach the app, you're going to need to [expose your local port as a public URL](https://slack.dev/bolt-python/tutorial/getting-started-http#setting-up-events).

You can do so with `ngrok`:

- Run bot's local server with `functions-framework --target=slack_bot`
- Install `ngrok` globally on your local machine: `brew install --cask ngrok`
- Run `ngrok`: `ngrok http <local-bolt-port>`
- Provide the generated public URL (`<slack-bot-url>/slack/events>`) in your APP page (`api.slack.com/apps/[id]`) under `Event subscriptions` > `Request URL`

...you should now be able to interact with you Slack bot locally.

### Deployment

**Create a GCP trigger which fires when the embedding.csv is updated (one time operation)**

Trigger a notification to the `embeddings-update-topic` topic each time a file is uploaded:

`gcloud storage buckets notifications create gs://slack-kb-chatgpt-responder-processed --topic=embeddings-update-topic --event-types=OBJECT_FINALIZE`

Create the subscription for the topic:

`gcloud pubsub subscriptions create embeddings-subscription --topic=embeddings-update-topic`

**Deploy command**

```
See .github/workflows/deploy-step.yml
```

Once deployed, provide the generated public URL in your APP page (`api.slack.com/apps/[id]`) under `Event subscriptions` > `Request URL`

...you should now be able to interact with you Slack bot.
