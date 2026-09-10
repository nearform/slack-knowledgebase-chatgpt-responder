import { after, before, test, mock } from 'node:test'
import sinon from 'sinon'

// notion.js constructs its Notion client as it loads, and crawl() runs the
// whole Notion crawl before it ever touches the storage variables, so a
// missing bucket name used to cost a complete crawl. index.js validates first
// and imports crawl.js dynamically: the assertions here are that the import
// rejects, that the Notion client was never constructed, and that no Notion
// search was issued, which is fetchData's first act. dotenv/config is
// neutralised so a developer's local .env cannot decide the outcome.

const notionConstructorSpy = sinon.spy()
const notionSearchSpy = sinon.spy()

class NotionClientMock {
  constructor(...args) {
    notionConstructorSpy(...args)
  }
  search = notionSearchSpy
  blocks = { children: { list: () => {} } }
}

const environmentBeforeTest = { ...process.env }

const variablesClearedForTest = [
  'NOTION_TOKEN',
  'GCP_STORAGE_BUCKET_NAME',
  'GCP_STORAGE_SCRAPED_FILE_NAME'
]

before(() => {
  mock.module('dotenv/config', {})
  mock.module('@notionhq/client', {
    namedExports: { Client: NotionClientMock }
  })

  for (const variableName of variablesClearedForTest) {
    delete process.env[variableName]
  }
})

after(() => {
  process.env = { ...environmentBeforeTest }
  mock.reset()
  sinon.restore()
})

test('loading the crawler entry point without its environment rejects before the crawl starts', async t => {
  await t.assert.rejects(
    () => import('../src/index.js'),
    error => {
      t.assert.match(error.message, /NOTION_TOKEN/)
      t.assert.match(error.message, /GCP_STORAGE_BUCKET_NAME/)
      t.assert.match(error.message, /GCP_STORAGE_SCRAPED_FILE_NAME/)
      return true
    }
  )

  sinon.assert.notCalled(notionConstructorSpy)
  sinon.assert.notCalled(notionSearchSpy)
})
