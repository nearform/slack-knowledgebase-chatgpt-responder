---
title: CSV schemas between stages
type: source
tags: [schema, raw-extract]
source_paths:
  - packages/crawler/src/notion.js
  - packages/embeddings-creation/src/create-embeddings.js
  - packages/slack-bot/test/getAnswer.test.js
source_commit: c4bc5ac
created: 2026-09-09
updated: 2026-09-09
---

# CSV schemas between stages

Raw extract of the two column contracts. Interpretation:
[[csv-as-interchange-format]].

## `scraped.csv` — crawler output

Header, asserted verbatim in `packages/crawler/test/utils.test.js`:

```
index,title,text
0,Super blog post,This is awesome!
```

Produced from `{ index, title, text }` records built at
`packages/crawler/src/notion.js:62`. `title` may be `null`.

## `embeddings.csv` — embedding stage output

Header, asserted verbatim in
`packages/embeddings-creation/test/create-embeddings.test.js`:

```
index,text,n_tokens,embeddings
0,Page content,2,"[-0.01002738,-0.03602738]"
```

Produced from the record built at
`packages/embeddings-creation/src/create-embeddings.js:100`. Note `title` is **not**
carried forward: it exists in `scraped.csv` and is dropped here. See [[content-chunk]].

## What the bot actually reads

The slack-bot fixtures begin with an unnamed first column, not `index`:

```
,text,n_tokens,embeddings
0,"Content page 1",3,"[-0.0135, -0.0032, -0.0034, -0.0278]"
```

matching the type annotation at `packages/slack-bot/src/getAnswer.js:29`:

```js
/** @type {"": string; n_tokens: number; embeddings: number[]; text: string;}[] | undefined */
```

The empty-string key is the index column after the `json-2-csv` round trip. The bot never
reads it.
