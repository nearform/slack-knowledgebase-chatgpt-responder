crawl:
	cd ./packages/crawler && npm run run-locally

embeddings:
	cd ./packages/embeddings-creation && source ./.venv/bin/activate && python3 run-locally.py
