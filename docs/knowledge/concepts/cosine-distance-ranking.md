---
title: Cosine distance ranking
type: concept
tags: [vectors, similarity, retrieval]
source_paths:
  - packages/slack-bot/src/utils.js
  - packages/slack-bot/src/getAnswer.js
source_commit: 4a9f973
created: 2026-09-09
updated: 2026-09-09
---

# Cosine distance ranking

Relevance is decided by one function:

```js
distance: 1 - cosineSimilarity(queryEmbedding, embedding)
```

`packages/slack-bot/src/utils.js:47`. Lower is nearer. The `1 -` inversion exists to
replicate the output of Python's `scipy` implementation, which the original OpenAI cookbook
example used, and the comment in the source cites that lineage. The test asserts the
distances match the Python implementation's values to three decimal places, which is a
useful piece of provenance to keep.

## How it is used

Every chunk is scored, the whole list is sorted ascending, and chunks are consumed in that
order until [[context-token-budget]] is spent. There is no threshold: **the nearest chunks
are always used, however far away they are.** A question with no relevant content in the
corpus still retrieves the least-bad chunks, and the model is left to notice they do not
answer it (which [[prompt-contract]] instructs it to do).

## Cost characteristics

This is a **linear scan over the entire corpus, in-process, per question**. There is no
vector index, no approximate search, no database. For a corpus of a few thousand chunks
that is genuinely fine and far simpler than the alternative. It is also the thing that
would have to change first if the corpus grew by an order of magnitude, alongside the
2GiB memory ceiling noted in [[embeddings-creation-module]].

Depends on the vectors produced by [[embeddings-creation-module]] and stored per
[[embeddings-csv-schema]]. Guarded by
`packages/slack-bot/test/distancesFromEmbeddings.test.js`.
