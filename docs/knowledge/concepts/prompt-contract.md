---
title: Prompt contract
type: concept
tags: [prompt, openai, product-behaviour]
source_paths:
  - packages/slack-bot/src/getAnswer.js
source_commit: c4bc5ac
created: 2026-09-09
updated: 2026-09-09
---

# Prompt contract

Eight messages, assembled at `packages/slack-bot/src/getAnswer.js:172` and sent at
`:209` with `temperature: 0` and `model: 'gpt-4.1'`. Verbatim text:
[[prompt-message-sequence]].

**This is product behaviour expressed as prose.** Changing the wording changes what users
receive, with no type error and no failing build. Treat it like an interface.

## What each instruction buys

| Instruction | Purpose |
|---|---|
| name the passage `<CONTEXT>` | gives later rules something to refer to |
| "I'm a NearForm employee" | frames the audience so answers assume internal context |
| pass the user's locale | so country-specific answers (policy, benefits) are relevant |
| apologise if `<CONTEXT>` lacks the answer | the only "I don't know" path |
| use only `<CONTEXT>` | what makes this retrieval-augmented rather than a general chatbot |
| never mention the source | keeps answers clean, at the cost of citations |

`temperature: 0` makes answers as reproducible as the API allows, which matters when the
same question may be asked by many people.

## Two things to notice

**The constraints are placed in `assistant` messages, not the system message.** The system
message is only `'You are a helpful assistant'`. Putting instructions in the assistant
role is unusual and is generally weaker than a system message, so the constraint against
using outside knowledge is softer than it looks.

**A stray quotation mark.** One instruction ends
`...any other source of information."` with an unmatched double quote. Cosmetic, and it is
asserted verbatim by `packages/slack-bot/test/getAnswer.test.js`, so removing it means
updating that test too.

## Coverage

The entire message array is asserted with `calledOnceWithExactly` in
`packages/slack-bot/test/getAnswer.test.js`. This is the strongest guard in the repo: any
prompt edit fails the suite immediately, which is the right trade for text that is really
product behaviour.

Note the other prompts in the codebase are **not** covered this way: the summarise prompts
in [[summarization-request]] have no tests at all.
