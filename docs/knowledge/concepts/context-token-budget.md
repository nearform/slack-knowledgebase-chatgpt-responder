---
title: Context token budget
type: concept
tags: [tokens, config, guard]
source_paths:
  - packages/slack-bot/src/getAnswer.js
source_commit: c4bc5ac
created: 2026-09-09
updated: 2026-09-09
---

# Context token budget

How much retrieved text reaches the model. Default 4000 tokens, overridable by
`MAX_CONTEXT_TOKENS`.

## The accumulation rule

Walking chunks in [[cosine-distance-ranking]] order, each chunk adds `n_tokens + 4` to a
running total, and the loop **breaks** at the first chunk that would exceed the budget
(`packages/slack-bot/src/getAnswer.js:124`). The `+ 4` approximates the separator overhead
per chunk. Note it breaks rather than continues, so one oversized chunk ends assembly even
if smaller chunks further down would have fitted.

## The guard, and why it is shaped oddly

```js
const parsed = Math.floor(Number(value))
if (!Number.isFinite(parsed) || parsed <= 0) return fallback
```

**Flooring happens before the guard, deliberately.** A fractional value like `0.9` floors
to `0`, which the `<= 0` check then rejects. If the guard ran first, `0.9` would pass as
positive and then floor to a zero budget, which would admit no chunks at all and produce
an answer built from nothing. The source comment says exactly this, and it is the kind of
ordering that looks arbitrary and is not.

Eight unusable values are covered by tests: `''`, `'   '`, `'lots'`, `'0'`, `'-4000'`,
`'4000ish'`, `'0.5'`, `'0.9'`.

## Precedence

The environment is only read as the *default value* of the `maxLength` parameter
(`packages/slack-bot/src/getAnswer.js:146`), so an explicit argument always wins. Worth
knowing: **no test sets both**, so that precedence could invert without failing the suite.
The spec labels it unguarded.

## The one observability signal

If a non-empty data set yields an empty context, `getAnswer` logs
`Empty context assembled from N chunks with a budget of M tokens` and **proceeds anyway**.
That warning is the only alarm on retrieval quality in the whole system, and it only fires
on total failure, not on a poor context. See [[retrieval-augmented-answering]].

Configured per environment in `.github/workflows/production-deploy.yml`, which passes the
repository variable of the same name.
