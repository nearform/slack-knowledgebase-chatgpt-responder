import fs from 'node:fs'
import { PubSub } from '@google-cloud/pubsub'
import {
  download,
  parseCsv,
  distancesFromEmbeddings,
  isLocalEnvironment
} from './utils.js'

const defaultEmbeddingModel = 'text-embedding-ada-002'

/** Floors before the guard on purpose: a fraction below 1 floors to zero. */
function parsePositiveTokenCount(value, fallback) {
  const parsed = Math.floor(Number(value))
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return parsed
}

const projectId = process.env.GCP_PROJECT_ID
const bucketName = process.env.GCP_STORAGE_BUCKET_NAME
const bucketEmbeddingsFile = process.env.GCP_STORAGE_EMBEDDING_FILE_NAME
const embeddingsSubscription = process.env.GCP_EMBEDDING_SUBSCRIPTION
// Per process so that concurrent processes, tests included, never share a file.
const localEmbeddingsFile = `/tmp/embeddings-${process.pid}.csv`

// @TODO Reorganize this data in a more suitable way to improve access and manipulation
/** @type {"": string; n_tokens: number; embeddings: number[]; text: string;}[] | undefined */
let defaultDataSet = undefined

let initializationPromise = undefined

/**
 * Load the embeddings, at most once at a time. The promise rejects if the load
 * fails, so callers surface the failure instead of waiting on it forever, and
 * the failed attempt is forgotten so the next caller can try again.
 */
function initialize() {
  if (!initializationPromise) {
    initializationPromise = loadEmbeddings().catch(error => {
      initializationPromise = undefined
      throw error
    })
  }
  return initializationPromise
}

async function loadEmbeddings() {
  const startedAt = Date.now()
  try {
    defaultDataSet = await getEmbeddingsFile()
  } catch (error) {
    console.error('Failed to load embeddings', error)
    throw error
  }
  console.log(
    `Loaded ${defaultDataSet.length} chunks in ${Date.now() - startedAt}ms`
  )
  if (!isLocalEnvironment) {
    subscribeToEmbeddingChanges()
  }
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
 * @param {Object} args
 * @param {import('openai').OpenAI} args.openai
 */
async function createContext({
  openai,
  question,
  dataSet,
  maxLength = parsePositiveTokenCount(process.env.MAX_CONTEXT_TOKENS, 4000),
  embeddingModel = defaultEmbeddingModel
}) {
  // Get the embeddings for the question
  const response = await openai.embeddings.create({
    model: embeddingModel,
    input: question
  })

  const queryEmbedding = response.data[0].embedding

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
 *
 * @param {Object} args
 * @param {import('openai').OpenAI} args.openai
 * @returns
 */
async function getAnswer({
  dataSet: customDataSet,
  model = 'gpt-4.1',
  question = 'What is NearForm?',
  maxLength = parsePositiveTokenCount(process.env.MAX_CONTEXT_TOKENS, 4000),
  embeddingModel = defaultEmbeddingModel,
  locale = 'en-IE',
  openai
}) {
  await initialize()
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

  if (context.length === 0 && dataSet.length > 0) {
    console.warn(
      `Empty context assembled from ${dataSet.length} chunks with a budget of ${maxLength} tokens`
    )
  }

  const messages = [
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
  ]

  console.log('messages', JSON.stringify(messages, null, 2))

  const response = await openai.chat.completions.create({
    messages,
    temperature: 0,
    model
  })

  return response.choices[0].message.content.trim()
}

export { getAnswer, initialize }

// Start loading now so the first question does not wait for it. A failure is
// reported by loadEmbeddings and retried by the next caller of initialize.
initialize().catch(() => {})
