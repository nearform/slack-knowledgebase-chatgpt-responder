init:
	mkdir -p .cache

clear-bot-port:
	kill -9 $$(lsof -t -i:8080)

crawler-start:
	npm start --workspace=crawler

crawl: init
	curl localhost:8080 -X POST \
  -H "Content-Type: application/json" \
  -H "ce-id: 123451234512345" \
  -H "ce-specversion: 1.0" \
  -H "ce-time: 2020-01-02T12:34:56.789Z" \
  -H "ce-type: google.cloud.pubsub.topic.v1.messagePublished" \
  -H "ce-source: //pubsub.googleapis.com/projects/slack-kb-chatgpt-responder/topics/crawler-topic" \
  -d '{ \
        "message": { \
          "data": "c3RhcnRfY3Jhd2w=" \
        } \
      }'

embeddings: init
	cd ./packages/embeddings-creation && source ./.venv/bin/activate && python3 run-locally.py

bot:
	cd ./packages/slack-bot && source ./.venv/bin/activate && functions-framework --target=slack_bot

expose-bot:
	ngrok http 8080
