import fs from 'node:fs'
import { describe, test, mock } from 'node:test'
import sinon from 'sinon'
import * as utils from '../src/utils.js'
import { createChatCompletionResponse } from './mocks/chatCompletion.js'

const embeddingsCsvMock = [
  ',text,n_tokens,embeddings',
  '0,"Content page 1",3,"[1, 0, 0, 0]"'
].join('\n')

const queryEmbeddingResponse = { data: [{ embedding: [1, 0, 0, 0] }] }

// Flipped by the tests to make the embeddings download fail or succeed.
let downloadFailure = undefined

mock.module('../src/utils.js', {
  namedExports: {
    ...utils,
    download: (_, __, destination) => {
      if (downloadFailure) {
        throw downloadFailure
      }
      fs.writeFileSync(destination, embeddingsCsvMock)
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

function createOpenaiMock() {
  return {
    embeddings: {
      create: sinon.spy(async () => queryEmbeddingResponse)
    },
    chat: {
      completions: {
        create: sinon.spy(async () => createChatCompletionResponse)
      }
    }
  }
}

describe('getAnswer initialization', () => {
  test('rejects when the embeddings fail to load, then loads on a retry', async t => {
    downloadFailure = new Error('bucket unavailable')
    t.after(() => {
      downloadFailure = undefined
    })

    const { getAnswer } = await import('../src/getAnswer.js?initialization=1')
    const openaiMock = createOpenaiMock()

    // Without a reject path this call would wait on an unsettled promise for
    // as long as the process lived.
    await t.assert.rejects(
      getAnswer({ openai: openaiMock, question: 'This is the question' }),
      /bucket unavailable/
    )

    // A failed load must not poison the process: the next call tries again.
    downloadFailure = undefined

    const answer = await getAnswer({
      openai: openaiMock,
      question: 'This is the question'
    })

    t.assert.strictEqual(answer, 'Actual chat response')
  })

  test('warns when a non empty data set produces an empty context', async t => {
    const warnings = []
    t.mock.method(console, 'warn', message => {
      warnings.push(message)
    })

    const { getAnswer } = await import('../src/getAnswer.js?initialization=2')
    const openaiMock = createOpenaiMock()

    // A budget of 1 token cannot fit the single 3 token page.
    await getAnswer({
      openai: openaiMock,
      question: 'This is the question',
      maxLength: 1
    })

    t.assert.deepStrictEqual(warnings, [
      'Empty context assembled from 1 chunks with a budget of 1 tokens'
    ])
  })

  test('does not warn when a context is assembled', async t => {
    const warnings = []
    t.mock.method(console, 'warn', message => {
      warnings.push(message)
    })

    const { getAnswer } = await import('../src/getAnswer.js?initialization=3')
    const openaiMock = createOpenaiMock()

    const answer = await getAnswer({
      openai: openaiMock,
      question: 'This is the question'
    })

    t.assert.strictEqual(answer, 'Actual chat response')
    t.assert.deepStrictEqual(warnings, [])
  })
})
