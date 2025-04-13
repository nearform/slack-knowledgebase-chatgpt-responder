import { test, mock } from 'node:test'
import { readFile } from 'node:fs/promises'
import fs from 'fs/promises'
import sinon from 'sinon'
import * as utils from '../src/utils.js'

const scrapedFileName = process.env.GCP_STORAGE_SCRAPED_FILE_NAME
const embeddingsFileName = process.env.GCP_STORAGE_EMBEDDING_FILE_NAME

const scrapedFileMock = 'index,title,text\n0,Title,Page content'

const expectedEmbeddings =
  'index,text,n_tokens,embeddings\n0,Page content,2,"[-0.01002738,-0.03602738]"'

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

const getOpenAIApiMock = (createEmbeddingMock = () => {}) =>
  function OpenAI() {
    return {
      embeddings: {
        create: createEmbeddingMock
      }
    }
  }

test('embeddings creation', async t => {
  const downloadMock = sinon.spy(async () =>
    fs.writeFile(scrapedFileName, scrapedFileMock)
  )

  const uploadMock = sinon.fake()
  const createEmbeddingMock = sinon.stub().returns(
    Promise.resolve({
      data: [{ embedding: [-0.01002738, -0.03602738] }]
    })
  )

  mock.module('../src/utils.js', {
    namedExports: {
      ...utils,
      download: downloadMock,
      upload: uploadMock
    }
  })

  mock.module('openai', {
    defaultExport: getOpenAIApiMock(createEmbeddingMock)
  })

  const { createEmbeddings } = await import('../src/create-embeddings.js?t=1')

  await createEmbeddings(testEvent)
  const result = await readFile(embeddingsFileName, 'utf-8')

  t.assert.deepStrictEqual(result, expectedEmbeddings)

  sinon.assert.calledOnce(createEmbeddingMock)

  sinon.assert.calledOnceWithExactly(
    uploadMock,
    testEvent.data.bucket,
    embeddingsFileName
  )

  sinon.assert.calledOnceWithExactly(
    downloadMock,
    testEvent.data.bucket,
    scrapedFileName,
    scrapedFileName
  )
})
