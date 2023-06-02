# Slack knowledge base ChatGPT responder

![CI](https://github.com/nearform/slack-knowledgebase-chatgpt-responder/actions/workflows/ci.yml/badge.svg?event=push)
![Production deploy](https://github.com/nearform/slack-knowledgebase-chatgpt-responder/actions/workflows/production-deploy.yml/badge.svg?event=push)

1. **Crawler**: fetches the **source content** from Notion (The NearForm way section) at scheduled times, and stores the results as a csv file on a Google Cloud Storage bucket
2. **Embeddings creation**: generates the relevant embeddings based on Crawler's output using OpenAI APIs. Generated embeddings are stored as a csv file in the same bucket
3. **Slack bot**: implements a Slack bot which generates answers using the source content, content embeddings and [ChatCompletion OpenAI API](https://platform.openai.com/docs/guides/chat)

![alt text](./assets/schema.png 'Schema')

This project is a Node.js port of what described in [official OpenAI documentation](https://platform.openai.com/docs/tutorials/web-qa-embeddings) and [relevant example](https://github.com/openai/openai-cookbook/tree/main/apps/web-crawl-q-and-a) about using OpenAI api to build an AI that can answer questions about a custom set of data.

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

Once the cli is installed, login with `gcloud auth login`

Create the project and enable the required services: https://cloud.google.com/eventarc/docs/run/create-trigger-storage-gcloud#before-you-begin

Enable `cloudresourcemanager.googleapis.com`:

```
gcloud services enable cloudresourcemanager.googleapis.com --project $PROJECT_ID
```

### Install ngrok

In order to run the slack bot locally you'll need to install `ngrok` globally on your local machine: `brew install --cask ngrok`

## Crawler

#### Environment variables

Add the following values in an `.env` file (needed for local development). You can access these from Bitwarden, within the Hub content folder.

| Env var                         |                                         |
| ------------------------------- | --------------------------------------- |
| `NOTION_TOKEN`                  | Notion token created in initial setup   |
| `GCP_STORAGE_BUCKET_NAME`       | GCP bucket name hosting embeddings file |
| `GCP_STORAGE_SCRAPED_FILE_NAME` | Scraped data file name on the bucket    |

## Embeddings creation

#### Environment variables

Add the following values in an `.env` file (needed for local development). You can access these from Bitwarden, within the Hub content folder.

| Env var                           |                                      |
| --------------------------------- | ------------------------------------ |
| `OPENAI_API_KEY`                  | OpenAI API key                       |
| `GCP_STORAGE_SCRAPED_FILE_NAME`   | Scraped data file name on the bucket |
| `GCP_STORAGE_EMBEDDING_FILE_NAME` | Embeddings file name on the bucket   |

## Slack bot

### Installation

#### Slack application setup

1. Create a new slack workspace and a new Slack application or use an existing one.
2. Please refer to https://slack.dev/bolt-js/tutorial/getting-started-http to have a general understanding of how `bolt` works and how to setup a Slack app to interact with the bot.
3. Enable bot's direct messages in your APP page in `api.slack.com/apps/[id] > App Home > Show Tabs > Allow users to send Slash commands and messages from the messages tab`
4. Copy paste the following JML configuration in `api.slack.com/apps/[id] > App Manifest` (you'll have to replace `<slack-bot-url>` with the actual slack-bot production url, see [Slack setup](#slack-setup))

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

#### Environment variables

Add the following values in an `.env` file (needed for local development). You can access these from Bitwarden, within the Hub content folder, except for the specific values you are using based on your setup from Slack.

| Env var                           |                                                                            |
| --------------------------------- | -------------------------------------------------------------------------- |
| `GCP_EMBEDDING_SUBSCRIPTION`      | Embedding file update subscription name                                    |
| `GCP_STORAGE_BUCKET_NAME`         | GCP bucket name hosting embeddings file                                    |
| `GCP_STORAGE_EMBEDDING_FILE_NAME` | Embeddings file name on the bucket                                         |
| `SLACK_SIGNING_SECRET`            | `api.slack.com/apps/[id]` > `Basic information` > `Signing Secret`         |
| `SLACK_BOT_TOKEN`                 | `api.slack.com/apps/[id]` > `OAuth & Permissions` > `Bot User OAuth Token` |
| `OPENAI_API_KEY`                  | Open API key                                                               |

#### Slack setup

Once the bot is running on a public url (production or local environment with `make bot-expose`) you should tell Slack where the bot is deployed.

The bot url should be provided as `<public-bot-url>/slack/events` to Slack APP page configuration (`api.slack.com/apps/[id]`) under `Event subscriptions` > `Request URL`

...you should now be able to interact with the bot via Slack!

## Run the project locally

Once installed/configured all the modules, you can run locally executing the following make actions from the root folder:

### Crawler

- `make crawl`: create source content (`scraped.csv`) from Notion pages

### Embedding creation

- `make embeddings-start`: start Embeddings creation service (`localhost:3002`)
- `make embeddings`: generate the relevant embeddings (`embeddings.csv`)

### Slack bot

- `make bot-start`: start Slack bot (`localhost:3003`)
- `make bot-expose`: expose Slack bot to a public url
- `make bot-ask q="My question?"`: ask a question programmatically (no need to run the bot)
