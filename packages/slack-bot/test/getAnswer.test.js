import fs from 'node:fs'
import tap from 'tap'
import esmock from 'esmock'
import sinon from 'sinon'

const embeddingsCsvMock = [
  ',text,n_tokens,embeddings',
  '0,"Content page 1",3,"[-0.013505536131560802, -0.003233536845073104, -0.0034607935231179, -0.027816209942102432]"',
  '1,"Content page 2",3,"[-0.011297900229692459, -0.02328406274318695, -0.01141477469354868, 0.001078657223843038]"'
].join('\n')

const createEmbeddingResponse = {
  data: {
    data: [
      {
        embedding: [
          0.01764809899032116, 0.010304464027285576, 0.00995383970439434,
          -0.0057625784538686275
        ]
      }
    ]
  }
}

const createChatCompletionResponse = {
  data: {
    choices: [
      {
        message: {
          content: '\n\nActual chat response'
        }
      }
    ]
  }
}

tap.test('getAnswer', async t => {
  t.test('returns expected answer', async tt => {
    const createEmbeddingMock = sinon.spy(async () => {
      return createEmbeddingResponse
    })
    const createChatCompletionMock = sinon.spy(async () => {
      return createChatCompletionResponse
    })

    const { getAnswer } = await esmock(
      '../src/getAnswer.js',
      {
        '../src/utils.js': {
          download: (_, __, destination) => {
            fs.writeFileSync(destination, embeddingsCsvMock)
          }
        }
      },
      {
        openai: {
          Configuration: class OpenAIConfigurationMock {},
          OpenAIApi: class OpenAIApiMock {
            createEmbedding = createEmbeddingMock
            createChatCompletion = createChatCompletionMock
          }
        }
      }
    )

    const actual = await getAnswer({ question: 'Question' })
    const expected = 'Actual chat response'
    tt.equal(actual, expected)

    sinon.assert.calledOnceWithExactly(createEmbeddingMock, {
      model: 'text-embedding-ada-002',
      input: 'Question'
    })

    const expectedContext = 'Content page 2\n\n###\n\nContent page 1'
    sinon.assert.calledOnceWithExactly(createChatCompletionMock, {
      messages: [
        { role: 'system', content: 'You are a helpful assistant' },
        {
          role: 'assistant',
          content: `I can answer using only the following data, if a question contains something not related to NearForm I will answer 'I'm sorry but I can only provide answers to questions related to NearForm': ${expectedContext}`
        },
        {
          role: 'user',
          content: 'Question'
        }
      ],
      temperature: 0,
      top_p: 1,
      stop: undefined,
      max_tokens: 150,
      model: 'gpt-4'
    })
  })
})
