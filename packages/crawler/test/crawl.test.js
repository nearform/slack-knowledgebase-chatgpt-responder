import { test, afterEach, mock } from 'node:test'
import sinon from 'sinon'
import fs from 'node:fs'
import * as utils from '../src/utils.js'

const env = Object.assign({}, process.env)

afterEach(function () {
  process.env = env
  sinon.restore()
})

test('crawl', async t => {
  const bucketName = 'bucket-name'
  const scrapedFileName = 'scraped.csv'
  process.env.GCP_STORAGE_BUCKET_NAME = bucketName
  process.env.GCP_STORAGE_SCRAPED_FILE_NAME = scrapedFileName

  const fetchDataMock = sinon.fake.returns(
    Promise.resolve([
      { index: 0, title: 'Super blog post', text: 'This is awesome!' }
    ])
  )
  const uploadMock = sinon.fake()

  mock.module('../src/notion.js', {
    namedExports: {
      fetchData: fetchDataMock
    }
  })
  mock.module('../src/utils.js', {
    namedExports: {
      ...utils,
      upload: uploadMock
    }
  })

  const { crawl } = await import('../src/crawl.js?t=1')

  await crawl()

  sinon.assert.calledOnce(fetchDataMock)
  sinon.assert.calledOnceWithExactly(uploadMock, bucketName, scrapedFileName)

  const localScrapedFile = fs.readFileSync(scrapedFileName, 'utf8')
  t.assert.strictEqual(
    localScrapedFile,
    'index,title,text\n0,Super blog post,This is awesome!'
  )
})
