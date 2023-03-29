init:
	mkdir -p .cache

clear-bot-port:
	kill -9 $$(lsof -t -i:8080)

crawl: init
	cd ./packages/crawler && npm run run-locally

embeddings: init
	cd ./packages/embeddings-creation && source ./.venv/bin/activate && python3 run-locally.py

bot:
	cd ./packages/slack-bot && source ./.venv/bin/activate && functions-framework --target=slack_bot

expose-bot:
	ngrok http 8080
