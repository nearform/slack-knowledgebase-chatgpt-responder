import tap from 'tap'
import esmock from 'esmock'
import { Readable } from 'node:stream'
import { readFile } from 'fs/promises'
import { createWriteStream } from 'node:fs'

const scrapedFileName = 'scraped.csv'
const embeddingsFileName = 'embeddings.csv'

const scrapedFileMock = 'index,title,text\n0,Title,Page content'
const openAIEmbeddingsResponseMock = {
  data: [{ embedding: [-0.010027382522821426] }]
}

const expectedEmbeddings =
  ',text,n_tokens,embeddings\n0,Page content,2,[-0.010027382522821426]\n'

const testEvent = {
  id: 'event_id',
  type: 'event_type',
  data: {
    bucket: 'bucket',
    name: scrapedFileName,
    metageneration: 'metageneration',
    timeCreated: 'timeCreated',
    updated: 'updated'
  }
}

const fileObjectMock = {
  createReadStream: () => Readable.from(scrapedFileMock),
  createWriteStream: () => createWriteStream(embeddingsFileName)
}

function Storage() {
  this.bucket = {
    file: () => fileObjectMock
  }
}

function OpenAI() {
  this.getEmbeddings = () => Promise.resolve(openAIEmbeddingsResponseMock)
}

tap.test('embeddings creation', async t => {
  const { createEmbeddings } = await esmock('../src/create-embeddings.js', {
    '@google-cloud/storage': { Storage },
    openai: { OpenAI }
  })

  await createEmbeddings(testEvent)
  const result = await readFile(embeddingsFileName, 'utf-8')
  t.equal(result, expectedEmbeddings)
})
