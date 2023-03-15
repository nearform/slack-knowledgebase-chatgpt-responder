# @nearform/knowledge-base-responder-slack-bot

## Installation

### Slack application setup

Create a new slack workspace and a new Slack application or use an existing one.

Please refer to https://slack.dev/bolt-python/tutorial/getting-started-http to have a general understanding of how `bolt-python` works and how to setup a Slack app to interact with the bot.

> IMPORTANT NOTE: **we are NOT leveraging the web socket mode** but using the good old **HTTP setup** in order to be able to deploy the bot as a lambda.

Once the BOT is deployed (or executed locally), you'll have to provide your Slack app configuration with bot's public URL (see docs below)

### Environment variables

Add the following values in an `.env` file:

| Env var                            | Where is Slack App admin page                                    |
| ---------------------------------- | ---------------------------------------------------------------- |
| `SLACK_SIGNING_SECRET`             | `api.slack.com` > `Basic information` > `Signing Secret`         |
| `SLACK_BOT_TOKEN`                  | `api.slack.com` > `OAuth & Permissions` > `Bot User OAuth Token` |
| `OPENAI_API_KEY`                   | Open API key                                                     |
| `ABSOLUTE_PATH_TO_EMBEDDINGS_FILE` | Absolute path to a local embeddings file (optional)              |
| `PORT`                             | Port the bot listens to (optional)                               |

### Python setup

- Install virtual environment with `python -m venv .venv`
- Activate the environment with `source .venv/bin/activate`
- Install project dependencies with `pip install -r requirements.txt`
- Run the project with `python main.py`

## Local development

Since Bolt runs on the local host and Slack needs a public URL to reach the app, you're going to need to [expose your local port as a public URL](https://slack.dev/bolt-python/tutorial/getting-started-http#setting-up-events).

You can do so with `ngrok`:

- Install `ngrok` globally on your local machine: `brew install --cask ngrok`
- Run `ngrok`: `ngrok http <local-bolt-port>`
- Provide the generated public URL (`<bot-public-url>/slack/events>`) in your APP page in `api.slack.com` under `Event subscriptions` > `Request URL`

## Deployment

```
[TBD]
```

Once deployed provide the generated public URL (`<bot-public-url>/slack/events>`) in your APP page in `api.slack.com` under `Event subscriptions` > `Request URL`
