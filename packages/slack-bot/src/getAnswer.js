import fs from 'node:fs'
import dotenv from 'dotenv'
import { download, parseCsv } from './utils.js'

dotenv.config()

// openai.api_key = os.environ.get("OPENAI_API_KEY")
const projectName = process.env.GCP_PROJECT_NAME
const bucketName = process.env.GCP_STORAGE_BUCKET_NAME
const bucketEmbeddingsFile = process.env.GCP_STORAGE_EMBEDDING_FILE_NAME
const embeddingsSubscription = process.env.GCP_EMBEDDING_SUBSCRIPTION
const localEmbeddingsFile = '.cache/embeddings.csv'
let df = undefined

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

  // Python implementation forced the embedding values to be transformed to python entities (in case they are strings)
  // and tranforms emeddings array into numbpy.array entities:
  // df["embeddings"] = df["embeddings"].apply(eval).apply(np.array)

  // Parse csv columns
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

function createContext() {}

async function getAnswer({
  df = 'as',
  model = 'ass',
  question = 'What is NearForm?',
  maxLen = 1800,
  size = 'ada',
  debug = false,
  maxTokens = 150,
  stopSequence = undefined
}) {
  const context = createContext({ question, df, maxLen, size })

  return `You said: ${question}`
}

export { getAnswer }

initialize()
