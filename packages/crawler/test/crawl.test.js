import tap from 'tap'
import esmock from 'esmock'
import sinon from 'sinon'
import fs from 'node:fs'

const env = Object.assign({}, process.env)

tap.afterEach(function () {
  process.env = env
  sinon.restore()
})

tap.test('crawl', async t => {
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

  const { crawl } = await esmock('../src/crawl.js', {
    '../src/notion.js': {
      fetchData: fetchDataMock
    },
    '../src/utils.js': {
      upload: uploadMock
    }
  })

  await crawl()

  sinon.assert.calledOnce(fetchDataMock)
  sinon.assert.calledOnceWithExactly(uploadMock, bucketName, scrapedFileName)

  const localScrapedFile = fs.readFileSync(scrapedFileName, 'utf8')
  t.equal(
    localScrapedFile,
    'index,title,text\n0,Super blog post,This is awesome!'
  )
})
