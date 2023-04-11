import tap from 'tap'
import esmock from 'esmock'
import sinon from 'sinon'

tap.afterEach(function () {
  sinon.restore()
})

tap.test('crawl', async () => {
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
    '../src/file-upload.js': {
      upload: uploadMock
    }
  })

  await crawl()

  sinon.assert.calledOnceWithExactly(
    uploadMock,
    'index,title,text\n0,Super blog post,This is awesome!'
  )

  sinon.assert.calledOnce(fetchDataMock)
})
