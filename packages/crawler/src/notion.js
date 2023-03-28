import { Client } from '@notionhq/client'
import pMap from 'p-map'

const notion = new Client({
  auth: process.env.NOTION_TOKEN
})

const getPageTitle = (item, fieldName) => {
  const hasProperties = 'properties' in item

  if (hasProperties) {
    const field = item.properties[fieldName]

    if (field && 'title' in field) {
      return 'title' in field ? field.title[0]?.plain_text : null
    }
  }

  return null
}

export const getPages = async () => {
  let data = []
  let hasMore = true
  let cursor = undefined

  while (hasMore) {
    const result = await notion.search({
      filter: {
        value: 'page',
        property: 'object'
      },
      start_cursor: cursor,
      page_size: 10
    })

    hasMore = result.has_more
    cursor = result.next_cursor

    data = [
      ...data,
      ...result.results.map(item => {
        const id = item.id
        const title = getPageTitle(item, 'Name') || getPageTitle(item, 'title')

        return { id, title }
      })
    ]
  }

  return data
}

const getPageContent = async id => {
  const blocks = await notion.blocks.children.list({ block_id: id })
  return blocks.results
    .filter(item => 'type' in item)
    .flatMap(item => {
      const blockObject = item
      const blockType = blockObject.type
      return blockObject[blockType]?.rich_text?.map(text => text.plain_text)
    })
    .filter(Boolean)
}

export const fetchData = async () => {
  const pages = await getPages()

  const mapper = async (page, i) => {
    const content = await getPageContent(page.id)
    return {
      index: i,
      title: page.title,
      text: content.join(' ').replace(/(\r\n|\n|\r)/gm, '')
    }
  }

  const results = await pMap(pages, mapper, { concurrency: 5 })

  return results.filter(page => page.text)
}
