# @nearform/knowledge-base-responder-slack-bot

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
- Run the project with `python main.py`

### Slack setup

Since Bolt runs on the local host and Slack needs a public URL to reach the app, you're going to need to [expose your local port as a public URL](https://slack.dev/bolt-python/tutorial/getting-started-http#setting-up-events).

You can do so with `ngrok`:

- Run bot's local server with `python main.py`
- Install `ngrok` globally on your local machine: `brew install --cask ngrok`
- Run `ngrok`: `ngrok http <local-bolt-port>`
- Provide the generated public URL (`<slack-bot-url>/slack/events>`) in your APP page (`api.slack.com/apps/[id]`) under `Event subscriptions` > `Request URL`

...you should now be able to interact with you Slack bot locally.

## Deployment

**Create a GCP trigger which fires when the embedding.csv is updated (one time operation)**

Trigger a notification to the `embeddings-update-topic` topic each time a file is uploaded:

`gcloud storage buckets notifications create gs://slack-kb-chatgpt-responder-processed --topic=embeddings-update-topic --event-types=OBJECT_FINALIZE`

Create the subscription for the topic:

`gcloud pubsub subscriptions create embeddings-subscription --topic=embeddings-update-topic`

**Deploy command**

```
gcloud functions deploy slackBot --runtime python39 --trigger-http --entry-point slack_bot --allow-unauthenticated --verbosity="debug" --env-vars-file .env.yaml --memory 512MB --region="europe-west1"
```

Once deployed, provide the generated public URL in your APP page (`api.slack.com/apps/[id]`) under `Event subscriptions` > `Request URL`

...you should now be able to interact with you Slack bot.
