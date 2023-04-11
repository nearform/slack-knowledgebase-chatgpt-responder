import fs from 'node:fs'
import { Configuration, OpenAIApi } from 'openai'
import { PubSub } from '@google-cloud/pubsub'
import {
  download,
  parseCsv,
  distancesFromEmbeddings,
  isLocalEnvironment
} from './utils.js'

const defaultEmbeddingModel = 'text-embedding-ada-002'
const projectId = process.env.GCP_PROJECT_ID
const bucketName = process.env.GCP_STORAGE_BUCKET_NAME
const bucketEmbeddingsFile = process.env.GCP_STORAGE_EMBEDDING_FILE_NAME
const embeddingsSubscription = process.env.GCP_EMBEDDING_SUBSCRIPTION
const localEmbeddingsFile = '.cache/embeddings.csv'

// @TODO Reorganize this data in a more suitable way to improve access and manipulation
/** @type {"": string; n_tokens: number; embeddings: number[]; text: string;}[] | undefined */
let defaultDataSet = undefined

const openai = new OpenAIApi(
  new Configuration({
    apiKey: process.env.OPENAI_API_KEY
  })
)

// @TODO Since initialization is async, we expose a promise to avoid race conditions on getAnswer calls
let initializationPromise = undefined
async function initialize() {
  initializationPromise = new Promise(resolve => {
    makeLocalCacheFolder()
    getEmbeddingsFile()
      .then(result => {
        defaultDataSet = result
      })
      .then(() => {
        if (!isLocalEnvironment) {
          subscribeToEmbeddingChanges()
        }
      })
      .then(resolve)
  })
}

function makeLocalCacheFolder() {
  const cache = './.cache'

  if (!fs.existsSync(cache)) {
    fs.mkdirSync(cache)
  }
}

async function getEmbeddingsFile() {
  await download(bucketName, bucketEmbeddingsFile, localEmbeddingsFile)
  const csv = fs.readFileSync(localEmbeddingsFile)
  const dataSet = await parseCsv(csv, { encoding: 'utf8' })
  /*
   * Python implementation forced the embedding values to be transformed to python entities (in case they are strings)
   * and transforms embeddings array into `numbpy.array` entities:
   * dataSet["embeddings"] = dataSet["embeddings"].apply(eval).apply(np.array)
   */

  // Parse csv columns
  // @NOTE shall we parse all columns?
  dataSet.forEach(line => {
    const { embeddings, n_tokens } = line
    if (embeddings) {
      line['embeddings'] = JSON.parse(embeddings)
    }
    if (n_tokens) {
      line['n_tokens'] = JSON.parse(n_tokens)
    }
  })

  return dataSet
}

function subscribeToEmbeddingChanges() {
  const pubSubClient = new PubSub()

  const messageHandler = async message => {
    // send the ack as first operation to avoid receiving duplicate messages caused by getEmbeddingsFile: it might take a bit of time
    message.ack()
    if (
      message.attributes.objectId == bucketEmbeddingsFile &&
      message.attributes.eventType == 'OBJECT_FINALIZE'
    ) {
      console.log('New embeddings.csv received...')
      defaultDataSet = await getEmbeddingsFile()
    }
  }

  const subName = `projects/${projectId}/subscriptions/${embeddingsSubscription}`
  const subscription = pubSubClient.subscription(subName)
  subscription.on('message', messageHandler)
}

/**
 * Create a context for a question by finding the most similar context from the dataframe
 */
async function createContext({
  question,
  dataSet,
  maxLength = 1800,
  embeddingModel = defaultEmbeddingModel
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

async function getAnswer({
  dataSet: customDataSet,
  model = 'gpt-4',
  question = 'What is NearForm?',
  maxLength = 1800,
  embeddingModel = defaultEmbeddingModel,
  maxTokens = 300,
  stopSequence
}) {
  await initializationPromise
  const dataSet = customDataSet ?? defaultDataSet
  if (!dataSet) {
    // @TODO shall we validate the date frame?
    throw new Error('No data frame provided')
  }

  const context = await createContext({
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
        content:
          "You are providing information to NearForm employees asking questions about NearForm's knowledge base."
      },
      {
        role: 'assistant',
        content: `This is NearForm's knowledge base:\n\n${context.join(
          '\n\n###\n\n'
        )}`
      },
      {
        role: 'assistant',
        content:
          "You can only produce answers based on NearForm's knowledge base provided before. You must not use any other information source."
      },
      {
        role: 'assistant',
        content:
          'If the question is about NearForm but you cannot find an answer in the provided knowledge base you will answer: "I\'m sorry I could not find relevant information."'
      },
      {
        role: 'assistant',
        content:
          'If a question is not related to NearForm you will answer "I\'m sorry but I can only provide answers to questions related to NearForm."'
      },
      {
        role: 'user',
        content: question
      }
    ],
    temperature: 0,
    top_p: 1,
    stop: stopSequence,
    max_tokens: maxTokens,
    model
  })

  return response.data.choices[0].message.content.trim()
}

export { getAnswer }

initialize()
