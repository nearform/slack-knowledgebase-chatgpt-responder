import os
from dotenv import load_dotenv
from slack_bolt import App
from slack_bolt.adapter.google_cloud_functions import SlackRequestHandler
import knowledge_base

load_dotenv()  # take environment variables from .env.


# Initializes your app with your bot token and socket mode handler
# See: https://slack.dev/bolt-python/tutorial/getting-started
app = App(token=os.environ.get("SLACK_BOT_TOKEN"), signing_secret=os.environ.get("SLACK_SIGNING_SECRET"))


@app.event("message")
def handle_message(event, say):
    # Check if the message is a direct message to the bot
    if event["channel_type"] == "im":
        text = event["text"]
        # Your logic for handling direct messages goes here
        say(knowledge_base.get_answer(text))


handler = SlackRequestHandler(app)


###CLOUDRUN
def slack_bot(request):
    return handler.handle(request)


###LOCAL DEVELOPMENT
if __name__ == "__main__":
    app.start(port=int(os.environ.get("LOCAL_PORT", 3000)))
