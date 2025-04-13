import fs from 'node:fs'
import { describe, test, mock } from 'node:test'
import sinon from 'sinon'
import * as utils from '../src/utils.js'

const embeddingsCsvMock = [
  ',text,n_tokens,embeddings',
  '0,"Content page 1",3,"[-0.013505536131560802, -0.003233536845073104, -0.0034607935231179, -0.027816209942102432]"',
  '1,"Content page 2",3,"[-0.011297900229692459, -0.02328406274318695, -0.01141477469354868, 0.001078657223843038]"'
].join('\n')

const createEmbeddingResponse = {
  data: [
    {
      embedding: [
        0.01764809899032116, 0.010304464027285576, 0.00995383970439434,
        -0.0057625784538686275
      ]
    }
  ]
}

const createChatCompletionResponse = {
  choices: [
    {
      message: {
        content: '\n\nActual chat response'
      }
    }
  ]
}

describe('getAnswer', () => {
  test('returns expected answer', async t => {
    const createEmbeddingMock = sinon.spy(async () => {
      return createEmbeddingResponse
    })
    const createChatCompletionMock = sinon.spy(async () => {
      return createChatCompletionResponse
    })

    const openApiMock = {
      embeddings: {
        create: createEmbeddingMock
      },
      chat: {
        completions: {
          create: createChatCompletionMock
        }
      }
    }

    mock.module('../src/utils.js', {
      namedExports: {
        ...utils,
        download: (_, __, destination) => {
          fs.writeFileSync(destination, embeddingsCsvMock)
        }
      }
    })

    mock.module('openai', {
      defaultExport: openApiMock
    })

    mock.module('@google-cloud/pubsub', {
      namedExports: {
        PubSub: class PubSubMock {
          subscription = () => ({ on: () => {} })
        }
      }
    })

    const { getAnswer } = await import('../src/getAnswer.js?t=1')

    const question = 'This is the question'
    const locale = 'en-IE'

    const actualAnswer = await getAnswer({ openai: openApiMock, question })
    const expectedAnswer = 'Actual chat response'
    t.assert.strictEqual(actualAnswer, expectedAnswer)

    sinon.assert.calledOnceWithExactly(createEmbeddingMock, {
      model: 'text-embedding-ada-002',
      input: question
    })

    const expectedContext = ['Content page 1', 'Content page 2']
    sinon.assert.calledOnceWithExactly(createChatCompletionMock, {
      messages: [
        { role: 'system', content: 'You are a helpful assistant' },
        {
          role: 'assistant',
          content: `We are going to call the following set of information <CONTEXT>:\n\n${expectedContext.join(
            '\n\n###\n\n'
          )}`
        },
        {
          role: 'user',
          content: `I'm a NearForm employee and I'm going to ask questions about <CONTEXT> or NearForm.`
        },
        {
          role: 'user',
          content: `My current locale is ${locale} so factor this in to the context of my questions so that information you provide relevant to my country.`
        },
        {
          role: 'assistant',
          content: `If there is NO relevant information in <CONTEXT> to answer the question, then briefly apologize with the user.`
        },
        {
          role: 'assistant',
          content: `If you provide an answer, use only the information existing in <CONTEXT>. You must not use any other source of information."`
        },
        {
          role: 'assistant',
          content: `If you provide an answer you MUST not mention the source of the information nor <CONTEXT>. Provide just the expected information.`
        },
        // @TODO add here last provided answers (as assistant) to enable a conversational interaction
        {
          role: 'user',
          content: `Question: ${question}`
        }
      ],
      temperature: 0,
      model: 'gpt-4'
    })
  })
})
