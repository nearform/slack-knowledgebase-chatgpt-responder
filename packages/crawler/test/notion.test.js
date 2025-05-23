import { beforeEach, describe, test, mock } from 'node:test'

import fakePageResponse from './mocks/page-response.json' with { type: 'json' }
import fakeChildrenResponse from './mocks/children-response.json' with { type: 'json' }

const getNotionClientMock = ({ listMock = () => {}, searchMock = () => {} }) =>
  class NotionClientMock {
    constructor() {}

    search = searchMock

    blocks = {
      children: {
        list: listMock
      }
    }
  }

describe('notion', () => {
  beforeEach(() => {
    mock.reset()
  })

  test('fetchData returns correct parsed data', async t => {
    mock.module('@notionhq/client', {
      namedExports: {
        Client: getNotionClientMock({
          searchMock: async () => fakePageResponse,
          listMock: async ({ block_id }) => fakeChildrenResponse[block_id]
        })
      }
    })

    const { fetchData } = await import('../src/notion.js?t=1')

    t.assert.snapshot(await fetchData())
  })

  test('getPages works correctly with pagination', async t => {
    const searchMock = mock.fn()
    searchMock.mock.mockImplementationOnce(
      async () => ({
        object: 'list',
        results: [
          {
            object: 'page',
            id: '1e031055-cf03-4a06-959b-226ffedce769',
            created_time: '2022-05-24T14:16:00.000Z',
            last_edited_time: '2022-05-24T14:16:00.000Z',
            created_by: {
              object: 'user',
              id: '69d8af77-2406-4ce6-b1f6-5737c2d4c3ac'
            },
            last_edited_by: {
              object: 'user',
              id: '69d8af77-2406-4ce6-b1f6-5737c2d4c3ac'
            },
            cover: null,
            icon: {
              type: 'file',
              file: {
                url: 'https://s3.us-west-2.amazonaws.com/secure.notion-static.com/50817f00-9d46-4f30-aa91-720eff63a598/notion-logo.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIAT73L2G45EIPT3X45%2F20230328%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20230328T130314Z&X-Amz-Expires=3600&X-Amz-Signature=2ddbdae48697b8e76c310b13a185b40a5b08c1d5f427e9384f242ed571293f70&X-Amz-SignedHeaders=host&x-id=GetObject',
                expiry_time: '2023-03-28T14:03:14.697Z'
              }
            },
            parent: {
              type: 'page_id',
              page_id: 'ee9ac277-3734-4802-80b5-1674c6220b4c'
            },
            archived: false,
            properties: {
              title: {
                id: 'title',
                type: 'title',
                title: [
                  {
                    type: 'text',
                    text: {
                      content: 'Notion training videos',
                      link: null
                    },
                    annotations: {
                      bold: false,
                      italic: false,
                      strikethrough: false,
                      underline: false,
                      code: false,
                      color: 'default'
                    },
                    plain_text: 'Notion training videos',
                    href: null
                  }
                ]
              }
            },
            url: 'https://www.notion.so/Notion-training-videos-1e031055cf034a06959b226ffedce769'
          }
        ],
        next_cursor: '03c88c3d-d32d-4af9-ab30-fe9792b1937f',
        has_more: true,
        type: 'page_or_database',
        page_or_database: {}
      }),
      0
    )

    searchMock.mock.mockImplementationOnce(
      async () => ({
        object: 'list',
        results: [
          {
            object: 'page',
            id: '03c88c3d-d32d-4af9-ab30-fe9792b1937f',
            created_time: '2022-05-24T14:16:00.000Z',
            last_edited_time: '2022-07-27T08:20:00.000Z',
            created_by: {
              object: 'user',
              id: '69d8af77-2406-4ce6-b1f6-5737c2d4c3ac'
            },
            last_edited_by: {
              object: 'user',
              id: '69d8af77-2406-4ce6-b1f6-5737c2d4c3ac'
            },
            cover: null,
            icon: {
              type: 'file',
              file: {
                url: 'https://s3.us-west-2.amazonaws.com/secure.notion-static.com/d7162936-822c-4c00-b2e9-53899d7416ff/notion-logo-no-background.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIAT73L2G45EIPT3X45%2F20230328%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20230328T130314Z&X-Amz-Expires=3600&X-Amz-Signature=cc4a78a6e3916bff1989a3aba63c06ecd0f3e5f33075879c15fc9e53ebbcd12d&X-Amz-SignedHeaders=host&x-id=GetObject',
                expiry_time: '2023-03-28T14:03:14.697Z'
              }
            },
            parent: {
              type: 'page_id',
              page_id: 'cf3ead78-4ca0-4f8e-8e91-bec8345cdc80'
            },
            archived: false,
            properties: {
              title: {
                id: 'title',
                type: 'title',
                title: [
                  {
                    type: 'text',
                    text: {
                      content: 'Notion 101 Resources',
                      link: null
                    },
                    annotations: {
                      bold: false,
                      italic: false,
                      strikethrough: false,
                      underline: false,
                      code: false,
                      color: 'default'
                    },
                    plain_text: 'Notion 101 Resources',
                    href: null
                  }
                ]
              }
            },
            url: 'https://www.notion.so/Notion-101-Resources-ee9ac2773734480280b51674c6220b4c'
          }
        ],
        next_cursor: null,
        has_more: false,
        type: 'page_or_database',
        page_or_database: {}
      }),
      1
    )

    mock.module('@notionhq/client', {
      namedExports: {
        Client: getNotionClientMock({
          searchMock
        })
      }
    })

    const { getPages } = await import('../src/notion.js?t=2')

    await getPages()

    t.assert.strictEqual(searchMock.mock.calls.length, 2)

    t.assert.deepStrictEqual(searchMock.mock.calls[0].arguments[0], {
      filter: {
        value: 'page',
        property: 'object'
      },
      start_cursor: undefined,
      page_size: 10
    })

    t.assert.deepStrictEqual(searchMock.mock.calls[1].arguments[0], {
      filter: {
        value: 'page',
        property: 'object'
      },
      start_cursor: '03c88c3d-d32d-4af9-ab30-fe9792b1937f',
      page_size: 10
    })
  })
})
