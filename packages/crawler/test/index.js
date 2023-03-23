import tap from 'tap'
import esmock from 'esmock'
import sinon from 'sinon'

tap.afterEach(function () {
  sinon.restore()
})

tap.test('successfull', async t => {
  const fetchDataMock = sinon.fake.returns(
    Promise.resolve([
      { index: 0, title: 'Super blog post', text: 'This is awesome!' }
    ])
  )
  const uploadMock = sinon.fake()

  const { crawl, CMD } = await esmock('../src/index.js', {
    '@google-cloud/functions-framework': {
      ff: (_, cb) => {
        cb()
      }
    },
    '../src/notion.js': {
      fetchData: fetchDataMock
    },
    '../src/file-upload.js': {
      upload: uploadMock
    }
  })

  await crawl(CMD)
  t.equal(uploadMock.callCount, 1)
  t.ok(
    uploadMock.calledWith(
      'index,title,text\n0,Super blog post,This is awesome!'
    )
  )
  t.equal(fetchDataMock.callCount, 1)
})

tap.test('wrong command', async t => {
  const fetchDataMock = sinon.fake.returns(Promise.resolve([]))
  const uploadMock = sinon.fake()

  sinon.spy(console, 'log')

  const { crawl } = await esmock('../src/index.js', {
    '@google-cloud/functions-framework': {
      ff: (_, cb) => {
        cb()
      }
    },
    '../src/notion.js': {
      fetchData: fetchDataMock
    },
    '../src/file-upload.js': {
      upload: uploadMock
    }
  })

  await crawl('wrong_cmd')
  t.equal(uploadMock.callCount, 0)
  t.equal(fetchDataMock.callCount, 0)
  t.ok(console.log.calledWith('noop, received "wrong_cmd" command'))
})
