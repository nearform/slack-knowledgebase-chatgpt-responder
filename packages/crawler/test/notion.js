import tap from 'tap'
import esmock from 'esmock'

import fakePageResponse from './mocks/page-response.json' assert { type: 'json' }
import fakeChildrenResponse from './mocks/children-response.json' assert { type: 'json' }

const getNotionClientMock = listFn =>
  class NotionClientMock {
    constructor() {}

    async search() {
      return fakePageResponse
    }

    blocks = {
      children: {
        list: listFn
      }
    }
  }

tap.test('fetchData returns correct parsed data', async t => {
  const { fetchData } = await esmock('../src/notion.js', {
    '@notionhq/client': {
      Client: getNotionClientMock(
        async ({ block_id }) => fakeChildrenResponse[block_id]
      )
    }
  })

  t.matchSnapshot(await fetchData(), 'fetchData() result does not match!')
})
