import pMap from 'p-map'
import { csv2json, json2csv } from 'json-2-csv'
import fs from 'node:fs/promises'
import tiktoken from 'tiktoken-node'
import { Configuration, OpenAIApi } from 'openai'
import { backOff } from 'exponential-backoff'
import { download, upload } from './utils.js'

const EMBEDDING_MODEL = 'text-embedding-ada-002'
const SCRAPED_FILE_NAME = process.env.GCP_STORAGE_SCRAPED_FILE_NAME
const EMBEDDINGS_FILE_NAME = process.env.GCP_STORAGE_EMBEDDING_FILE_NAME
const MAX_TOKENS = 500

const configuration = new Configuration({ apiKey: process.env.OPENAI_API_KEY })
const openai = new OpenAIApi(configuration)

const tokenizer = tiktoken.getEncoding('cl100k_base')

function splitIntoMany(text) {
  const sentences = text.split('. ')
  const sentencesWithTokens = sentences.map(sentence => ({
    sentence,
    n_tokens: tokenizer.encode(` ${sentence}`).length
  }))

  let chunks = []
  let tokensSoFar = 0
  let chunk = []

  sentencesWithTokens.forEach(sentenceWithTokens => {
    // if the number of tokens so far plus the number of tokens in the current sentence is greater
    // than the max number of tokens, then add the chunk to the list of chunks and reset
    // the chunk and tokens so far
    if (tokensSoFar + sentenceWithTokens.n_tokens > MAX_TOKENS) {
      chunks.push(`${chunk.join('. ')}.`)
      chunk = []
      tokensSoFar = 0
    }

    // if the number of tokens in the current sentence is greater than the max number of
    // tokens, go to the next sentence
    if (sentenceWithTokens.n_tokens > MAX_TOKENS) {
      return
    }

    // otherwise, add the sentence to the chunk and add the number of tokens to the total
    chunk.push(sentenceWithTokens.sentence)
    tokensSoFar += sentenceWithTokens.n_tokens + 1
  })

  return chunks
}

export async function createEmbeddings(event) {
  const data = event.data

  const bucketName = data.bucket
  const name = data.name

  if (name !== SCRAPED_FILE_NAME) {
    console.log(`Skipping processing of file ${name}`)
    return
  }

  await download(bucketName, name, SCRAPED_FILE_NAME)

  const scrapedRecords = await csv2json(
    (await fs.readFile(SCRAPED_FILE_NAME)).toString()
  )

  const shortened = scrapedRecords
    .filter(record => record.text)
    .map(record => {
      return { ...record, n_tokens: tokenizer.encode(record.text).length }
    })
    .reduce((acc, record) => {
      // if the number of tokens is greater than the max number of tokens, split the text into chunks
      if (record.n_tokens > MAX_TOKENS) {
        return [...acc, ...splitIntoMany(record.text)]
      } else {
        // Otherwise, add the text to the list of shortened texts
        return [...acc, record.text]
      }
    }, [])

  const embeddingRequestMapper = async (short, i) => {
    const response = await backOff(() =>
      openai.createEmbedding({
        model: EMBEDDING_MODEL,
        input: short
      })
    )

    return {
      index: i,
      text: short,
      n_tokens: tokenizer.encode(short).length,
      embeddings: response.data.data[0].embedding
    }
  }

  const embeddings = await pMap(shortened, embeddingRequestMapper, {
    concurrency: 10
  })

  const embeddingsCsv = await json2csv(embeddings)
  await fs.writeFile(EMBEDDINGS_FILE_NAME, embeddingsCsv)
  await upload(bucketName, EMBEDDINGS_FILE_NAME)
}
