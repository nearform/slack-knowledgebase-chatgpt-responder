import { Storage } from '@google-cloud/storage'
import { Configuration, OpenAIApi } from 'openai'
import fs from 'node:fs'
import { parse } from 'csv-parse'
import { stringify } from 'csv-stringify'
import tiktoken from 'tiktoken-node'

const EMBEDDING_MODEL = 'text-embedding-ada-002'
const tokenizer = tiktoken.getEncoding('cl100k_base')

const maxTokens = 500

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

async function createEmbeddings(cloudEvent) {
  const SCRAPED_FILE_NAME = process.env.GCP_STORAGE_SCRAPED_FILE_NAME
  const EMBEDDINGS_FILE_NAME = process.env.GCP_STORAGE_EMBEDDING_FILE_NAME

  const storage = new Storage()

  const data = cloudEvent.data
  const eventId = cloudEvent.id
  const eventType = cloudEvent.type

  const bucketName = data.bucket
  const name = data.name
  const metageneration = data.metageneration
  const timeCreated = data.timeCreated
  const updated = data.update
  console.log({
    eventId,
    eventType,
    bucket: bucketName,
    file: name,
    metageneration,
    created: timeCreated,
    updated
  })

  if (name !== SCRAPED_FILE_NAME) {
      console.log(`Skipping processing of file ${name}`)
      return
  }
  const parser = parse()
  const rows = []
  parser.on('readable', function() {
    let record
    while ((record = parser.read()) !== null) {
      if (!record.text) {
        continue
      }
      const nTokens = tokenizer.encode(record.text).length
      if (nTokens > maxTokens) {
        rows.push(...splitText(record.text))
      } else {
        const embeddings = await openai.getEmbeddings({ model: EMBEDDING_MODEL, input: record.text })
        rows.push({
          text: record.text,
          n_tokens: nTokens,
          embeddings,
        })
      }
    }
  })

  parser.on('end', function() {
    const stringifier = stringify(rows, { header: true, columns: ['text', 'n_tokens', 'embeddings']})
    const embeddingsFileWriter = bucket.file(EMBEDDINGS_FILE_NAME).createWriteStream()
    stringifier.pipe(embeddingsFileWriter)
  })

  const bucket = storage.bucket(bucketName)
  const file = bucket.file(name)
  file.createReadStream().pipe(parser)
}

async function splitText(text) {
  const sentences = text.split('. ')
  const nTokens = sentences.map(function(sentence) {
    return tokenizer.encode(" " + sentence)
  })
  const chunks = []
  let chunk = []
  let tokensSoFar = 0
  for (let i = 0; i < sentences.length; i++) {
    /* If the number of tokens so far plus the number of tokens in the current sentence is greater
       than the max number of tokens, then add the chunk to the list of chunks and reset
       the chunk and tokens so far */
    const sentence = sentences[i]
    const nTokens = tokenizer.encode(" " + sentence)
    if (tokensSoFar + nTokens > maxTokens) {
      const text = chunk.join('. ') + '.'
      const nTokensInChunk = tokenizer.encode(text).length
      const embeddings = await openai.getEmbeddings({ model: EMBEDDING_MODEL, input: text })
      chunks.push({
        text,
        n_tokens: nTokensInChunk,
        embeddings,
      })
      chunk = []
      tokensSoFar = 0
    }
    /* If the number of tokens in the current sentence is greater than the max number of
       tokens, go to the next sentence */
    if (nTokens > maxTokens) {
      continue
    }
    // Otherwise, add the sentence to the chunk and add the number of tokens to the total
    chunk.push(sentence)
    tokensSoFar += nTokens + 1
  }

  return chunks
}
