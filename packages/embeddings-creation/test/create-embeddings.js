import tap from 'tap'
import esmock from 'esmock'
import { readFile } from 'fs/promises'
import fs from 'fs/promises'
import sinon from 'sinon'

const scrapedFileName = 'scraped.csv'
const embeddingsFileName = 'embeddings.csv'

const scrapedFileMock = 'index,title,text\n0,Title,Page content'

const expectedEmbeddings =
  'index,text,n_tokens,embeddings\n0,Page content,2,[-0.010027382522821426]'

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

class ConfigurationMock {
  constructor() {}
}

class OpenAIApiMock {
  constructor() {}

  createEmbedding = () => {
    return Promise.resolve({
      data: {
        data: [{ embedding: [-0.010027382522821426] }]
      }
    })
  }
}

tap.test('embeddings creation', async t => {
  const downloadMock = async () =>
    fs.writeFile(scrapedFileName, scrapedFileMock)

  const uploadMock = sinon.fake()

  const { createEmbeddings } = await esmock('../src/create-embeddings.js', {
    '../src/utils.js': { download: downloadMock, upload: uploadMock },
    openai: { Configuration: ConfigurationMock, OpenAIApi: OpenAIApiMock }
  })

  await createEmbeddings(testEvent)
  const result = await readFile(embeddingsFileName, 'utf-8')
  t.equal(result, expectedEmbeddings)
  t.ok(uploadMock.calledOnce)
})
