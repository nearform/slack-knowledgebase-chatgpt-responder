import fs from 'node:fs'
import { PubSub } from '@google-cloud/pubsub'
import {
  download,
  parseCsv,
  distancesFromEmbeddings
} from '../utils/ai.utils.js'
import {
  GCP_STORAGE_BUCKET_NAME,
  GCP_STORAGE_EMBEDDING_FILE_NAME,
  DEFAULT_EMBEDDING_MODEL,
  LOCAL_EMBEDDINGS_FILE,
  GCP_SUB_NAME,
  IS_LOCAL_ENVIRONMENT
} from '../config.js'

// @TODO Reorganize this data in a more suitable way to improve access and manipulation
/** @type {{"": string; n_tokens: number; embeddings: number[]; text: string;}[] | undefined} */
let defaultDataSet = undefined

// @TODO Since initialization is async, we expose a promise to avoid race conditions on getAnswer calls
let initializationPromise = undefined
async function initialize() {
  initializationPromise = new Promise(resolve => {
    getEmbeddingsFile()
      .then(result => {
        defaultDataSet = result
      })
      .then(() => {
        if (!IS_LOCAL_ENVIRONMENT) {
          subscribeToEmbeddingChanges()
        }
      })
      .then(resolve)
  })
}

async function getEmbeddingsFile() {
  await download(
    GCP_STORAGE_BUCKET_NAME,
    GCP_STORAGE_EMBEDDING_FILE_NAME,
    LOCAL_EMBEDDINGS_FILE
  )
  const csv = fs.readFileSync(LOCAL_EMBEDDINGS_FILE).toString()
  const dataSet = await parseCsv(csv)
  return dataSet
}

function subscribeToEmbeddingChanges() {
  const pubSubClient = new PubSub()

  const messageHandler = async message => {
    // send the ack as first operation to avoid receiving duplicate messages caused by getEmbeddingsFile: it might take a bit of time
    message.ack()
    if (
      message.attributes.objectId == GCP_STORAGE_EMBEDDING_FILE_NAME &&
      message.attributes.eventType == 'OBJECT_FINALIZE'
    ) {
      console.log('New embeddings.csv received...')
      defaultDataSet = await getEmbeddingsFile()
    }
  }

  const subscription = pubSubClient.subscription(GCP_SUB_NAME)
  subscription.on('message', messageHandler)
}

/**
 * Create a context for a question by finding the most similar context from the dataframe
 */
async function createContext({
  openai,
  question,
  dataSet,
  maxLength = 1800,
  embeddingModel = DEFAULT_EMBEDDING_MODEL
}) {
  // Get the embeddings for the question
  const response = await openai.createEmbedding({
    model: embeddingModel,
    input: question
  })

  const queryEmbedding = response.data.data[0].embedding

  // Get the distances from the embeddings
  const distances = distancesFromEmbeddings({
    queryEmbedding,
    embeddings: dataSet.map(line => line.embeddings)
  })

  const sortedDistances = distances.sort((a, b) => a.distance - b.distance)

  const context = []
  let contextLength = 0
  for (const { index } of sortedDistances) {
    const contentEmbedding = dataSet[index]
    contextLength += contentEmbedding['n_tokens'] + 4

    if (contextLength > maxLength) {
      break
    }

    context.push(contentEmbedding.text)
  }

  return context
}

/**
 * Get answer for question from openai
 * @param {Object} options - The shape is the same as SpecialType above
 * @param {string} [options.dataSet]
 * @param {string} [options.model]
 * @param {string} [options.question]
 * @param {number} [options.maxLength]
 * @param {string} [options.embeddingModel]
 * @param {number} [options.maxTokens]
 * @param {Object} [options.stopSequence]
 * @param {string} [options.locale]
 * @param {import('openai').OpenAIApi} options.openai
 * @returns {Promise<string>}
 */
async function getAnswer({
  dataSet: customDataSet,
  model = 'gpt-4',
  question = 'What is NearForm?',
  maxLength = 1800,
  embeddingModel = DEFAULT_EMBEDDING_MODEL,
  maxTokens = 300,
  stopSequence,
  locale = 'en-IE',
  openai
}) {
  await initializationPromise
  const dataSet = customDataSet ?? defaultDataSet
  if (!dataSet) {
    // @TODO shall we validate the date frame?
    throw new Error('No data frame provided')
  }

  const context = await createContext({
    openai,
    question,
    dataSet,
    maxLength,
    embeddingModel
  })

  const response = await openai.createChatCompletion({
    messages: [
      { role: 'system', content: 'You are a helpful assistant' },
      {
        role: 'assistant',
        content: `We are going to call the following set of information <CONTEXT>:\n\n${context.join(
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
    top_p: 1,
    stop: stopSequence,
    max_tokens: maxTokens,
    model
  })

  return response.data.choices[0].message?.content?.trim() ?? ''
}

export { getAnswer }

initialize()
