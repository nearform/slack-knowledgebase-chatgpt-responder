# @nearform/knowledge-base-responder-slack-bot

## Installation

### Slack application setup

Create a new slack workspace and a new Slack application or use an existing one.

Please refer to https://slack.dev/bolt-js/tutorial/getting-started to have a general understanding of how `@slack/bolt` works and how to setup a Slack app to interact with the bot.

### Environment variables

Head to https://api.slack.com/apps and select your app. Then copy/paste the following values in an `.env` file:

| Env var                | Where is Slack App admin page                  |
| ---------------------- | ---------------------------------------------- |
| `SLACK_SIGNING_SECRET` | `Basic information` > `Signing Secret`         |
| `SLACK_APP_TOKEN`      | `Basic information` > `App-Level Tokens`       |
| `SLACK_BOT_TOKEN`      | `OAuth & Permissions` > `Bot User OAuth Token` |
| `GET_ANSWER_API`       | API endpoint to fetch an answer from           |
