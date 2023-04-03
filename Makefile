init:
	mkdir -p .cache

crawl: init
	npm start --workspace=crawler

embeddings-start: init
	cd ./packages/embeddings-creation && source ./.venv/bin/activate && functions-framework --target=create_embeddings --signature-type=cloudevent --port=3002

embeddings: init
	curl localhost:3002 -X POST \
  -H "Content-Type: application/json" \
  -H "ce-id: 123451234512345" \
  -H "ce-specversion: 1.0" \
  -H "ce-time: 2020-01-02T12:34:56.789Z" \
  -H "ce-type: google.cloud.storage.object.v1.finalized" \
  -H "ce-source: //pubsub.googleapis.com/projects/slack-kb-chatgpt-responder/topics/embeddings-topic" \
  -d '{ \
        "bucket": "slack-kb-chatgpt-responder-processed", \
        "name": "scraped.csv", \
        "timeCreated": "2023-04-03T10:34:48.024Z", \
        "updated": "2023-04-03T10:34:48.024Z" \
      }'

bot-start:
	cd ./packages/slack-bot && source ./.venv/bin/activate && functions-framework --target=slack_bot --port=3003

bot-expose:
	ngrok http 3003