init:
	mkdir -p .cache

crawl: init
	cd ./packages/crawler && npm run run-locally

embeddings: init
	cd ./packages/embeddings-creation && source ./.venv/bin/activate && python3 run-locally.py
