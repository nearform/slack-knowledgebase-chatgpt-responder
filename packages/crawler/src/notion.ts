import { Client } from '@notionhq/client'
import {
  PageObjectResponse,
  PartialPageObjectResponse
} from '@notionhq/client/build/src/api-endpoints'

const notion = new Client({
  auth: process.env.NOTION_TOKEN
})

const getPageTitle = (
  item: PageObjectResponse | PartialPageObjectResponse,
  fieldName: 'Name' | 'title'
): string | null => {
  const hasProperties = 'properties' in item

  if (hasProperties) {
    const field = item.properties[fieldName]

    if (field && 'title' in field) {
      return 'title' in field ? field.title[0].plain_text : null
    }
  }

  return null
}

const getPages = async () => {
  const result = await notion.search({
    filter: {
      value: 'page',
      property: 'object'
    }
  })

  return result.results.map(item => {
    const pageObject = item as PageObjectResponse | PartialPageObjectResponse
    const id = pageObject.id
    const title =
      getPageTitle(pageObject, 'Name') || getPageTitle(pageObject, 'title')

    return { id, title }
  })
}

const getPageContent = async (id: string) => {
  const blocks = await notion.blocks.children.list({ block_id: id })
  return blocks.results
    .filter(item => 'type' in item)
    .flatMap(item => {
      const blockObject = item as any
      const blockType = blockObject.type
      return blockObject[blockType]?.rich_text?.map(
        (text: any) => text.plain_text
      )
    })
    .filter(Boolean)
}

export const fetchData = async () => {
  const pages = await getPages()
  const results = await Promise.all(
    pages.map(async page => {
      const content = await getPageContent(page.id)
      return {
        title: page.title,
        text: content.join(' ').replace(/(\r\n|\n|\r)/gm, '')
      }
    })
  )

  return results.filter(page => page.text)
}
