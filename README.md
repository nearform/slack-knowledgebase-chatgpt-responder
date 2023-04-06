# slack-knowledgebase-chatgpt-responder

![CI](https://github.com/nearform/slack-knowledgebase-chatgpt-responder/actions/workflows/ci.yml/badge.svg?event=push)
![Production deploy](https://github.com/nearform/slack-knowledgebase-chatgpt-responder/actions/workflows/production-deploy.yml/badge.svg?event=push)

1. **Crawler**: A function which crawls once a day data from Notion (The NearForm way section), and stores a csv file with the relevant page content
2. **Embeddings creation**: A function which generates an embeddings file based on **Crawler**'s csv output and using OpenAI Apis. The embeddings file is meant to create a context for our AI
3. **Slack bot**: A function that reads the embeddings files and uses OpenAI APIs to generate Slack bot-compliant answers about NearForm knowledge base

![alt text](./assets/schema.png 'Schema')

This project is based on this [official OpenAI documentation](https://platform.openai.com/docs/tutorials/web-qa-embeddings) and [relevant example](https://github.com/openai/openai-cookbook/tree/main/apps/web-crawl-q-and-a) about using OpenAI api to build an AI that can answer questions about a custom set of data.

## Table of contents

- [Initial setup](initial-setup)
- [Crawler](#crawler)
- [Embeddings creation](#embeddings-creation)
- [Slack bot](#slack-bot)
- [Run the project locally](#run-the-project-locally)

## Initial setup

### Notion: create a access token

Create a new notion integration and add it to a section. Please refer to https://www.notion.so/my-integrations.
Click on "New Integration", set `slack-kb-chatgpt-responder` as name. Under the "Capabilities" section, make sure that all the "Content Capabilities" are checked. No "Comment Capabilities" are required, same for the "User Capabilities".

To add the new integration, access to "The NearForm way" section in Notion, then click on the 3-dots icon in the top-right corner of the page and scroll the menu to reach the "Connections" section, from which you can click on "Add connection" to add the previously created one.

### Google Cloud

Install google cloud CLI to work on your local machine from [here](https://cloud.google.com/sdk/docs/install).
Once the cli is installed, perform the login using `gcloud auth login`

Create the project and enable all the required pieces: https://cloud.google.com/eventarc/docs/run/create-trigger-storage-gcloud#before-you-begin

## Crawler

### Installation

#### Environment variables

Add the following values in an `.env` file (needed for local development):

| Env var                         |                                         |
| ------------------------------- | --------------------------------------- |
| `NOTION_TOKEN`                  | Notion token created in intial setup    |
| `GCP_STORAGE_BUCKET_NAME`       | GCP bucket name hosting embeddings file |
| `GCP_STORAGE_SCRAPED_FILE_NAME` | Scraped data file name on the bucket    |

### Deploying

**Enable cloudresourcemanager.googleapis.com**

`gcloud services enable cloudresourcemanager.googleapis.com --project $PROJECT_ID`

**Create the container image (to run each time you want to update the image)**

From whithin the `packages/crawler` folder:

`gcloud builds submit --pack image=gcr.io/slack-kb-chatgpt-responder/crawler-job`

**Create the job (one-time operation)**:

```
gcloud beta run jobs create crawler-job \
    --image gcr.io/slack-kb-chatgpt-responder/crawler-job \
    --tasks 1 \
    --max-retries 1 \
    --region europe-west1 \
    --task-timeout 60m \
    --set-secrets NOTION_TOKEN=notion-token:latest \
    --set-env-vars GCP_STORAGE_BUCKET_NAME=slack-kb-chatgpt-responder-processed \
    --set-env-vars GCP_STORAGE_FILE_NAME=scraped.csv
```

**Create the cron job (one-time operation):**

```
gcloud scheduler jobs create http crawl-schedule-job \
  --location europe-west1 \
  --schedule="* * 1 * *" \
  --uri="https://europe-west1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/slack-kb-chatgpt-responder/jobs/crawler-job:run" \
  --http-method POST
```

**Deploy (from inside the `crawler` folder):**

```
See .github/workflows/deploy-step.yml
```

**👆 This is done automatically via github actions**

### Local testing

Just start the project using `npm start`.

If you are not logged in yet, use `gcloud auth application-default login`.

## Embeddings creation

#### Environment variables

Add the following values in an `.env` file (needed for local development):

| Env var                           | Where is Slack App admin page        |
| --------------------------------- | ------------------------------------ |
| `OPENAI_API_KEY`                  | OpenAI API key                       |
| `GCP_STORAGE_SCRAPED_FILE_NAME`   | Scraped data file name on the bucket |
| `GCP_STORAGE_EMBEDDING_FILE_NAME` | Embeddings file name on the bucket   |

### Deployment

```
See .github/workflows/deploy-step.yml
```

## Slack bot

Slack bot configured to respond to direct messages with NearForm knowledge base answers retrieved via chatGPT APIs.

### Installation

#### Slack application setup

1. Create a new slack workspace and a new Slack application or use an existing one.
2. Please refer to https://slack.dev/bolt-js/tutorial/getting-started-http to have a general understanding of how `bolt` works and how to setup a Slack app to interact with the bot.
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

#### Environment variables

Add the following values in an `.env` file (needed for local development):

| Env var                           | Where is Slack App admin page                                              |
| --------------------------------- | -------------------------------------------------------------------------- |
| `GCP_PROJECT_NAME`                | GCP Project name                                                           |
| `GCP_EMBEDDING_SUBSCRIPTION`      | Embedding file update subscription name                                    |
| `GCP_STORAGE_BUCKET_NAME`         | GCP bucket name hosting embeddings file                                    |
| `GCP_STORAGE_EMBEDDING_FILE_NAME` | Embeddings file name on the bucket                                         |
| `SLACK_SIGNING_SECRET`            | `api.slack.com/apps/[id]` > `Basic information` > `Signing Secret`         |
| `SLACK_BOT_TOKEN`                 | `api.slack.com/apps/[id]` > `OAuth & Permissions` > `Bot User OAuth Token` |
| `OPENAI_API_KEY`                  | Open API key                                                               |
| `GOOGLE_CLOUD_PROJECT`            | Set the same value as `GCP_PROJECT_NAME`, (dev only)                       |

### Local development

#### Google cloud provider setup

Login to GCP with `gcloud auth application-default login`.

#### Slack setup

Since Bolt runs on the local host and Slack needs a public URL to reach the app, you're going to need to [expose your local port as a public URL](https://slack.dev/bolt-js/tutorial/getting-started-http#setting-up-events-with-http).

You can do so with `ngrok`:

- Run bot's local server with `functions-framework --target=slackBot`
- Install `ngrok` globally on your local machine: `brew install --cask ngrok`
- Run `ngrok`: `ngrok http <local-bolt-port>`
- Provide the generated public URL as `<public-bot-url>/slack/events` in your APP page (`api.slack.com/apps/[id]`) under `Event subscriptions` > `Request URL`

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

Once deployed, provide the generated public URL in your Slack APP page (`api.slack.com/apps/[id]`) under `Event subscriptions` > `Request URL`

...you should now be able to interact with you Slack bot.

## Run the project locally

Once installed/configured all the modules, you can run them using the provided Makefile:

- `make crawl`: create source content (`scraped.csv`) from Notion pages
- `make embeddings-start`: start Embeddings creation service (`localhost:3002`)
- `make embeddings`: generate the relevant embeddings
- `make bot-start`: start Slack bot (`localhost:3003`)
- `make bot-expose`: expose Slack bot as a public url
- `make bot-ask q="My question?"`: query the chatbot programmatically

Slack bot public url should be provided as `<public-bot-url>/slack/events` to Slack APP page configuration (`api.slack.com/apps/[id]`) under `Event subscriptions` > `Request URL`
