import tap from 'tap'
import esmock from 'esmock'

import fakePageResponse from './page-response.json' assert { type: 'json' }
import fakeChildrenResponse from './children-response.json' assert { type: 'json' }

class NotionClientMock {
  constructor() {}

  async search() {
    return Promise.resolve(fakePageResponse)
  }

  blocks = {
    children: {
      list: ({ block_id }) => Promise.resolve(fakeChildrenResponse[block_id])
    }
  }
}

tap.test('fetchData returns correct parsed data', async t => {
  const { fetchData } = await esmock('../src/notion.js', {
    '@notionhq/client': {
      Client: NotionClientMock
    }
  })

  t.matchSnapshot(await fetchData(), 'fetchData() result does not match!')

  t.end()
})