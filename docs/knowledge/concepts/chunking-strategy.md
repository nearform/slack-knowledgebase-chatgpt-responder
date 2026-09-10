---
title: Chunking strategy
type: concept
tags: [tokens, tiktoken, defect]
source_paths:
  - packages/embeddings-creation/src/create-embeddings.js
source_commit: c4bc5ac
created: 2026-09-09
updated: 2026-09-09
---

# Chunking strategy

A [[knowledge-base-content]] page can be far longer than an embedding call should carry,
so long records are cut into chunks of at most `MAX_TOKENS` (500), counted with
`tiktoken`'s `cl100k_base` encoding.

## How `splitIntoMany` works

Split the text on `'. '`, token-count each sentence, then accumulate sentences into a
chunk. When adding the next sentence would exceed 500 tokens, push the accumulated chunk
and start a new one. A single sentence longer than 500 tokens is skipped outright.

Records **under** 500 tokens bypass this entirely and are embedded whole.

## Three real problems in it

**For the pages this crawler actually produces, the whole record is replaced by `"."`.**
This is the headline, not a corner case. `packages/crawler/src/notion.js:65` joins every
block with a single space and strips newlines, so a bullet- or heading-heavy Notion page
flattens to one long run of text containing no `'. '` boundary at all. `text.split('. ')`
(`packages/embeddings-creation/src/create-embeddings.js:20`) then returns a single
sentence, and since `splitIntoMany` is only called when `record.n_tokens > MAX_TOKENS`
(line 78), that lone sentence is always over budget. The over-budget branch at line 34
fires against an empty accumulator, so the `chunks.push` at line 35 pushes
`[].join('. ') + '.'`, the single character `"."`; lines 42-43 then discard the sentence.
`splitIntoMany` returns exactly `["."]`, confirmed by executing it against a single
900-token sentence. So the `"."` is not an extra chunk sitting alongside the record's real
chunks: it is the only chunk, 100% of that page's text is lost, and the `"."` is embedded
and stored as a [[content-chunk]] that can be retrieved as context. The pages a Notion
knowledge base tends to hold are exactly the ones this hits.

**The trailing chunk is dropped.** `chunks.push()` is only reached inside the
over-budget branch (`packages/embeddings-creation/src/create-embeddings.js:35`). When the
loop ends, whatever is still accumulated in `chunk` is never pushed. So for every record
longer than 500 tokens, the final chunk of its text never becomes a [[content-chunk]] and
is silently absent from the corpus. Short records are unaffected. This is the code as it
stands, not documented intent, and it is worth fixing test-first.

**Splitting on `'. '` is fragile.** Abbreviations, decimals and version numbers all split
mid-sentence, and the crawler has already stripped newlines
([[crawler-module]]), so there is no paragraph structure left to split on instead. The
joined-back chunk is also reconstructed as `chunk.join('. ') + '.'`, which normalises away
the original punctuation.

## Why the boundary matters downstream

Chunk size sets retrieval granularity. At 500 tokens, a chunk is roughly a long paragraph:
big enough to carry an answer, small enough that [[context-token-budget]] can fit several.
Change `MAX_TOKENS` and you change how many chunks fit in a context, and therefore how
broad an answer's evidence is.

Currently unguarded by tests: no test exercises a record over 500 tokens.

Applied by [[embeddings-creation-module]].
