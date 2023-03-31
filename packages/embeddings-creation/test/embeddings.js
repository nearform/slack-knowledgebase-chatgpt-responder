import tap from 'tap'
import esmock from 'esmock'
import sinon from 'sinon'
import { Readable } from 'node:stream'
import { readFile } from 'fs/promises'

// from google.cloud import storage
// import unittest
// import main
// import openai
// from unittest import mock
// from unittest.mock import MagicMock, patch

const scrapedFileName = 'scraped.csv'
const embeddingsFileName = 'embeddings.csv'

const scrapedFileMock = "index,title,text\n0,Title,Page content"
const openAIEmbeddingsResponseMock = {
  "data": [
    {
      "embedding": [
        -0.010027382522821426,
      ]
    }
  ]
}

const expectedEmbeddings = ",text,n_tokens,embeddings\n0,Page content,2,[-0.010027382522821426]\n"

const testEvent = {
  id: 'event_id',
  type: 'event_type',
  data: {
    bucket: 'bucket',
    name: process.env,
    metageneration: 'metageneration',
    timeCreated: 'timeCreated',
    updated: 'updated',
  }
}

const readPipe = sinon.spy()
const writePipe = sinon.spy()
const fileObjectMock = {
  createReadStream: () => Readable.from(scrapedFileMock),
  createWriteStream: () => fs.createWriteStream(embeddingsFileName),
}
const bucketFileMethodMock = sinon.fake.returns()
const bucketObjectMock = { file: bucketFileMethodMock }
const storageBucketMethodMock = sinon.fake.returns()
function Storage() {
  this.bucket = {
    file: () => fileObjectMock,
  }
}

function OpenAI() {
  this.getEmbeddings = () => Promise.resolve(openAIEmbeddingsResponseMock)
}

tap.test('embeddings creation', async t => {
  const { createEmbeddings } = await esmock('../src/index.js', {
    '@google-cloud/storage': { Storage },
    'openai': { OpenAI }
  });

  await createEmbeddings(testEvent)
  const result = await readFile(embeddingsFileName)
  t.equal(result, expectedEmbeddings)
})
