---
title: Prompt message sequence
type: source
tags: [prompt, raw-extract]
source_paths:
  - packages/slack-bot/src/getAnswer.js
source_commit: 4a9f973
created: 2026-09-09
updated: 2026-09-09
---

# Prompt message sequence

Verbatim extract from `packages/slack-bot/src/getAnswer.js:179-212`, kept here so
[[prompt-contract]] can discuss it without restating it. Sent with `temperature: 0` and
`model: 'gpt-4.1'` at `:216`.

| # | Role | Content |
|---|---|---|
| 1 | system | `You are a helpful assistant` |
| 2 | assistant | `We are going to call the following set of information <CONTEXT>:\n\n${context.join('\n\n###\n\n')}` |
| 3 | user | `I'm a NearForm employee and I'm going to ask questions about <CONTEXT> or NearForm.` |
| 4 | user | `My current locale is ${locale} so factor this in to the context of my questions so that information you provide relevant to my country.` |
| 5 | assistant | `If there is NO relevant information in <CONTEXT> to answer the question, then briefly apologize with the user.` |
| 6 | assistant | `If you provide an answer, use only the information existing in <CONTEXT>. You must not use any other source of information."` |
| 7 | assistant | `If you provide an answer you MUST not mention the source of the information nor <CONTEXT>. Provide just the expected information.` |
| 8 | user | `Question: ${question}` |

Chunks are joined with `\n\n###\n\n` as a separator. Message 6 ends with an unmatched
double quote, present in the source and asserted by the test.

A `@TODO` sits between messages 7 and 8 (`:207`) marking where prior answers would go to
make the exchange conversational.

The whole array is asserted with `sinon.assert.calledOnceWithExactly` in
`packages/slack-bot/test/getAnswer.test.js`, so any edit here fails the suite.
