import fs from 'node:fs'
import { Configuration, OpenAIApi } from 'openai'
import { PubSub } from '@google-cloud/pubsub'
import {
  download,
  parseCsv,
  distancesFromEmbeddings,
  isLocalEnvironment
} from './utils.js'
import { protectedPagesList } from './constants.js'

const defaultEmbeddingModel = 'text-embedding-ada-002'
const projectId = process.env.GCP_PROJECT_ID
const bucketName = process.env.GCP_STORAGE_BUCKET_NAME
const bucketEmbeddingsFile = process.env.GCP_STORAGE_EMBEDDING_FILE_NAME
const embeddingsSubscription = process.env.GCP_EMBEDDING_SUBSCRIPTION
const localEmbeddingsFile = './embeddings.csv'

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

async function getEmbeddingsFile() {
  await download(bucketName, bucketEmbeddingsFile, localEmbeddingsFile)
  const csv = fs.readFileSync(localEmbeddingsFile).toString()
  const dataSet = await parseCsv(csv)
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
        role: 'user',
        content: `The call the following set of information <CONTEXT>:\n\n${context.join(
          '\n\n###\n\n'
        )}`
      },
      {
        role: 'user',
        content: `I'm a NearForm employee and I'm going to ask questions about <CONTEXT> or NearForm.`
      },
      // Handle question about protected pages
      {
        role: 'user',
        content: `If question is related to one of the following subjects, explain that you cannot provide an answer since the the answer could change depending on the country:\n${protectedPagesList}`
      },
      {
        role: 'user',
        content: `If question is NOT related to <CONTEXT> or NearForm respond with: "I'm sorry but I can only provide answers to questions related to NearForm."`
      },
      {
        role: 'user',
        content: `If there is NO relevant information in <CONTEXT> to answer the question, then briefly apologize with the user.`
      },
      {
        role: 'user',
        content: `If you provide an answer, use only the information existing in <CONTEXT>. You must not use any other source of information."`
      },
      {
        role: 'user',
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

  return response.data.choices[0].message.content.trim()
}

export { getAnswer }

initialize()
