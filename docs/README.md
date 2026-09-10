# Docs

Per-subsystem specifications for this repository, reverse-engineered from the code. Read
the one relevant to your task rather than loading all three.

| Spec | Covers |
|---|---|
| [crawler](./crawler.md) | Notion discovery, block-content extraction, and the `scraped.csv` contract |
| [embeddings-creation](./embeddings-creation.md) | Chunking to 500 tokens, OpenAI embedding, and the `embeddings.csv` contract |
| [slack-bot](./slack-bot.md) | Answering, context budget, embeddings lifecycle, transcription, summaries |

Repository setup and environment variables live in [`../README.md`](../README.md); agent
context lives in [`../AGENTS.md`](../AGENTS.md).
