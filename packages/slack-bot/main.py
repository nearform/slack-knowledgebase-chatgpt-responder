import os
from dotenv import load_dotenv
from slack_bolt import App
from slack_bolt.adapter.socket_mode import SocketModeHandler
import knowledge_base

load_dotenv()  # take environment variables from .env.


# Initializes your app with your bot token and socket mode handler
# See: https://slack.dev/bolt-python/tutorial/getting-started
app = App(token=os.environ.get("SLACK_BOT_TOKEN"), signing_secret=os.environ.get("SLACK_SIGNING_SECRET"))


def greet(username):
    return f"Hey there <@{username}>!"


@app.message("hello")
def message_response(message, say):
    say(greet(message["user"]) + "\n" + knowledge_base.get_answer(message["text"]))


# Start your app
if __name__ == "__main__":
    app.start(port=int(os.environ.get("PORT", 3000)))
