import fs from 'node:fs'
import { Configuration, OpenAIApi } from 'openai'
import dotenv from 'dotenv'
import { download, parseCsv, distancesFromEmbeddings } from './utils.js'

dotenv.config()

const DEFAULT_EMBEDDING_MODEL = 'text-embedding-ada-002'
const projectName = process.env.GCP_PROJECT_NAME
const bucketName = process.env.GCP_STORAGE_BUCKET_NAME
const bucketEmbeddingsFile = process.env.GCP_STORAGE_EMBEDDING_FILE_NAME
const embeddingsSubscription = process.env.GCP_EMBEDDING_SUBSCRIPTION
const localEmbeddingsFile = '.cache/embeddings.csv'

// @TODO Reorganize this data in a more suitable way to improve access and manipulation
/** @type {"": string; n_tokens: number; embeddings: number[]; text: string;}[] | undefined */
let df = undefined

const openai = new OpenAIApi(
  new Configuration({
    apiKey: process.env.OPENAI_API_KEY
  })
)

async function initialize() {
  makeLocalCacheFolder()

  df = await getEmbeddingsFile()

  // @TODO Subscribe to embedding changes
  // subscribe_to_embedding_changes()
}

function makeLocalCacheFolder() {
  var cache = './.cache'

  if (!fs.existsSync(cache)) {
    fs.mkdirSync(cache)
  }
}

async function getEmbeddingsFile() {
  await download(bucketName, bucketEmbeddingsFile, localEmbeddingsFile)
  const csv = fs.readFileSync(localEmbeddingsFile)
  const df = await parseCsv(csv, { encoding: 'utf8' })
  /*
   * Python implementation forced the embedding values to be transformed to python entities (in case they are strings)
   * and transforms embeddings array into `numbpy.array` entities:
   * df["embeddings"] = df["embeddings"].apply(eval).apply(np.array)
   */

  // Parse csv columns
  // @NOTE shall we parse all columns?
  df.forEach(line => {
    const { embeddings, n_tokens } = line
    if (embeddings) {
      line['embeddings'] = JSON.parse(embeddings)
    }
    if (n_tokens) {
      line['n_tokens'] = JSON.parse(n_tokens)
    }
  })

  return df
}

/**
 * Create a context for a question by finding the most similar context from the dataframe
 */
async function createContext({
  question,
  df,
  maxLength = 1800,
  embeddingModel = DEFAULT_EMBEDDING_MODEL
}) {
  // Get the embeddings for the question
  const response = await openai.createEmbedding({
    model: embeddingModel,
    input: question
  })

  const questionEmbeddings = response.data.data[0].embedding

  // Get the distances from the embeddings
  const distances = distancesFromEmbeddings(
    questionEmbeddings,
    df.map(line => line.embeddings)
  )

  const sortedDistances = distances.sort((a, b) => a.distance - b.distance)

  const context = []
  let contextLength = 0
  for (const { index } of sortedDistances) {
    const contentEmbedding = df[index]
    contextLength += contentEmbedding['n_tokens'] + 4

    if (contextLength > maxLength) {
      break
    }

    context.push(contentEmbedding.text)
  }

  return context.join('\n\n###\n\n')
}

async function getAnswer({
  df: customDf,
  model = 'gpt-4',
  question = 'What is NearForm?',
  maxLength = 1800,
  embeddingModel = DEFAULT_EMBEDDING_MODEL,
  maxTokens = 150,
  stopSequence
}) {
  const dataFrame = customDf ?? df
  if (!dataFrame) {
    // @TODO shall we validate the date frame?
    throw new Error('No data frame provided')
  }

  const context = await createContext({
    question,
    df: dataFrame,
    maxLength,
    embeddingModel
  })

  const response = await openai.createChatCompletion({
    messages: [
      { role: 'system', content: 'You are a helpful assistant' },
      {
        role: 'assistant',
        content: `I can answer using only the following data, if a question contains something not related to NearForm I will answer 'I'm sorry but I can only provide answers to questions related to NearForm': ${context}`
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
