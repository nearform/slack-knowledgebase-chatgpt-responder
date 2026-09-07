import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, test, mock } from 'node:test'
import sinon from 'sinon'
import * as utils from '../src/utils.js'
import { createChatCompletionResponse } from './mocks/chatCompletion.js'

// Every row holds 1000 tokens, so the running context length after each row is
// 1004, 2008, 3012, 4016 and 5020 (the context loop counts 4 extra tokens per
// chunk). A 4000 token budget therefore admits the first three rows, and a
// 2500 token budget admits the first two.
const largeChunkTokenCount = 1000
const largeChunkEmbeddingsCsvMock = [
  ',text,n_tokens,embeddings',
  `0,"Most relevant page",${largeChunkTokenCount},"[1, 0, 0, 0]"`,
  `1,"Second most relevant page",${largeChunkTokenCount},"[0.8, 0.6, 0, 0]"`,
  `2,"Third most relevant page",${largeChunkTokenCount},"[0.6, 0.8, 0, 0]"`,
  `3,"Fourth most relevant page",${largeChunkTokenCount},"[0, 1, 0, 0]"`,
  `4,"Least relevant page",${largeChunkTokenCount},"[-1, 0, 0, 0]"`
].join('\n')

// Cosine similarity between this query embedding and the rows above is 1, 0.8,
// 0.6, 0 and -1, so the rows rank in the order they appear in the CSV.
const largeChunkQueryEmbeddingResponse = {
  data: [{ embedding: [1, 0, 0, 0] }]
}

const defaultBudgetContextPages = [
  'Most relevant page',
  'Second most relevant page',
  'Third most relevant page'
]

const reducedBudgetContextPages = [
  'Most relevant page',
  'Second most relevant page'
]

// getAnswer.js downloads the embeddings file when the module loads, so the
// mocks are registered once, before the first import. A module specifier can
// only be mocked once per process, so this cannot live inside the tests that
// re-import the module.
//
// localEmbeddingsFile is overridden with a path of this file's own, because
// test files run in parallel processes and would otherwise write and read the
// one path that getAnswer.js downloads to.
const testEmbeddingsFile = path.join(
  os.tmpdir(),
  'slack-bot-context-budget-embeddings.csv'
)

mock.module('../src/utils.js', {
  namedExports: {
    ...utils,
    localEmbeddingsFile: testEmbeddingsFile,
    download: (_, __, destination) => {
      fs.writeFileSync(destination, largeChunkEmbeddingsCsvMock)
    }
  }
})

mock.module('@google-cloud/pubsub', {
  namedExports: {
    PubSub: class PubSubMock {
      subscription = () => ({ on: () => {} })
    }
  }
})

let importedModuleInstances = 0

/**
 * Import a fresh instance of getAnswer.js backed by the large chunk data set,
 * so that its module level configuration is re-read from the environment.
 */
async function importGetAnswerWithLargeChunks() {
  const createChatCompletionMock = sinon.spy(async () => {
    return createChatCompletionResponse
  })

  const openaiMock = {
    embeddings: {
      create: sinon.spy(async () => largeChunkQueryEmbeddingResponse)
    },
    chat: {
      completions: {
        create: createChatCompletionMock
      }
    }
  }

  importedModuleInstances += 1
  const { getAnswer } = await import(
    `../src/getAnswer.js?budget=${importedModuleInstances}`
  )

  return { getAnswer, openaiMock, createChatCompletionMock }
}

/**
 * Read back the context pages the answer was built from.
 */
function contextPagesFrom(createChatCompletionMock) {
  const { messages } = createChatCompletionMock.firstCall.firstArg
  const contextMessage = messages.find(
    message =>
      message.role === 'assistant' && message.content.includes('<CONTEXT>:')
  )
  return contextMessage.content.split('<CONTEXT>:\n\n')[1].split('\n\n###\n\n')
}

describe('getAnswer context budget', () => {
  test('defaults to a 4000 token budget', async t => {
    delete process.env.MAX_CONTEXT_TOKENS

    const { getAnswer, openaiMock, createChatCompletionMock } =
      await importGetAnswerWithLargeChunks()

    await getAnswer({ openai: openaiMock, question: 'This is the question' })

    t.assert.deepStrictEqual(
      contextPagesFrom(createChatCompletionMock),
      defaultBudgetContextPages
    )
  })

  test('honours a valid MAX_CONTEXT_TOKENS override', async t => {
    process.env.MAX_CONTEXT_TOKENS = '2500'
    t.after(() => {
      delete process.env.MAX_CONTEXT_TOKENS
    })

    const { getAnswer, openaiMock, createChatCompletionMock } =
      await importGetAnswerWithLargeChunks()

    await getAnswer({ openai: openaiMock, question: 'This is the question' })

    t.assert.deepStrictEqual(
      contextPagesFrom(createChatCompletionMock),
      reducedBudgetContextPages
    )
  })

  test('lets an explicit maxLength argument win', async t => {
    delete process.env.MAX_CONTEXT_TOKENS

    const { getAnswer, openaiMock, createChatCompletionMock } =
      await importGetAnswerWithLargeChunks()

    await getAnswer({
      openai: openaiMock,
      question: 'This is the question',
      maxLength: 2500
    })

    t.assert.deepStrictEqual(
      contextPagesFrom(createChatCompletionMock),
      reducedBudgetContextPages
    )
  })

  const unusableEnvValues = ['', '   ', 'lots', '0', '-4000', '4000ish']

  for (const unusableEnvValue of unusableEnvValues) {
    test(`falls back to 4000 tokens when MAX_CONTEXT_TOKENS is ${JSON.stringify(
      unusableEnvValue
    )}`, async t => {
      process.env.MAX_CONTEXT_TOKENS = unusableEnvValue
      t.after(() => {
        delete process.env.MAX_CONTEXT_TOKENS
      })

      const { getAnswer, openaiMock, createChatCompletionMock } =
        await importGetAnswerWithLargeChunks()

      await getAnswer({ openai: openaiMock, question: 'This is the question' })

      // A NaN or zero budget would drop every page and answer from nothing.
      t.assert.deepStrictEqual(
        contextPagesFrom(createChatCompletionMock),
        defaultBudgetContextPages
      )
    })
  }
})
