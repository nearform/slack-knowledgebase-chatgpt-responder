import { Client } from '@notionhq/client'
import dotenv from 'dotenv'
import {
  PageObjectResponse,
  PartialPageObjectResponse
} from '@notionhq/client/build/src/api-endpoints'

dotenv.config()

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
    const pageTitle =
      getPageTitle(pageObject, 'Name') || getPageTitle(pageObject, 'title')

    return { id, pageTitle }
  })
}

getPages().then(console.log)
