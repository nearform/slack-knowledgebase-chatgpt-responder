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

// getAnswer.js starts loading the embeddings when the module loads, so the
// mocks are registered before it is imported. A module specifier can only be
// mocked once per process, and every test file runs in its own process.
mock.module('../src/utils.js', {
  namedExports: {
    ...utils,
    download: (_, __, destination) => {
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

const { getAnswer } = await import('../src/getAnswer.js')

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

describe('getAnswer requires a question', () => {
  // A spurious Slack event used to reach getAnswer with no question at all,
  // and a default parameter answered it as though someone had asked.
  const unusableQuestions = [
    { name: 'omitted', value: undefined },
    { name: 'null', value: null },
    { name: 'empty', value: '' },
    { name: 'whitespace only', value: '   \n\t ' },
    { name: 'not a string', value: 42 }
  ]

  for (const { name, value } of unusableQuestions) {
    test(`rejects a ${name} question without calling OpenAI`, async t => {
      const openaiMock = createOpenaiMock()

      await t.assert.rejects(
        getAnswer({ openai: openaiMock, question: value }),
        /getAnswer requires a question/
      )

      // The bug also burned an embedding request and a chat completion.
      sinon.assert.notCalled(openaiMock.embeddings.create)
      sinon.assert.notCalled(openaiMock.chat.completions.create)
    })
  }

  // Positive control beside the rejections: the same call with a real question
  // still answers, so the guard is not rejecting everything.
  test('still answers when a question is given', async t => {
    const openaiMock = createOpenaiMock()

    const answer = await getAnswer({
      openai: openaiMock,
      question: 'How do I book time off?'
    })

    t.assert.strictEqual(answer, 'Actual chat response')
    sinon.assert.calledOnce(openaiMock.chat.completions.create)
  })
})
