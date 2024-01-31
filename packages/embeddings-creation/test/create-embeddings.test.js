import tap from 'tap'
import esmock from 'esmock'
import { readFile } from 'fs/promises'
import fs from 'fs/promises'
import sinon from 'sinon'

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

tap.test('embeddings creation', async t => {
  const downloadMock = sinon.spy(async () =>
    fs.writeFile(scrapedFileName, scrapedFileMock)
  )

  const uploadMock = sinon.fake()
  const createEmbeddingMock = sinon.stub().returns(
    Promise.resolve({
      data: [{ embedding: [-0.01002738, -0.03602738] }]
    })
  )

  const { createEmbeddings } = await esmock('../src/create-embeddings.js', {
    '../src/utils.js': { download: downloadMock, upload: uploadMock },
    openai: getOpenAIApiMock(createEmbeddingMock)
  })

  await createEmbeddings(testEvent)
  const result = await readFile(embeddingsFileName, 'utf-8')

  t.equal(result, expectedEmbeddings)

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
