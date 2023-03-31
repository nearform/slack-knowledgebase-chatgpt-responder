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

export const fetchData = async () => {
  const pages = await getPages()

  const mapper = async (page, i) => {
    console.log(`Fetching page ${page.id}, ${i + 1} of ${pages.length}`)
    const content = await getRecursiveBlockContent(page.id)

    return {
      index: i,
      title: page.title,
      text: content.join(' ').replace(/(\r\n|\n|\r)/gm, '')
    }
  }

  const results = await pMap(pages, mapper, { concurrency: 3 })

  return results
}

const getRecursiveBlockContent = async blockId => {
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

  let blocks
  try {
    blocks = await notion.blocks.children.list({ block_id: blockId })
  } catch (e) {
    console.log(`Cannot fetch children of block ${blockId}...`)
    let retryCount = 1

    while (retryCount < 4) {
      console.log(`Retry #${retryCount}`)
      try {
        blocks = await notion.blocks.children.list({ block_id: blockId })
        console.log(`Succeded after #${retryCount} retry`)
        break
      } catch (e) {
        retryCount++
      }
    }
  }

  if (!blocks || blocks.results.length === 0) {
    return []
  }

  const blocksToProcess = blocks.results.filter(
    item => 'type' in item && item.id
  )

  const blockContent = blocksToProcess
    .flatMap(item => {
      const blockObject = item
      const blockType = blockObject.type
      return blockObject[blockType]?.rich_text?.map(text => text.plain_text)
    })
    .filter(Boolean)

  let childrenContents = []
  for (let i = 0; i < blocksToProcess.length; i++) {
    await delay(500)
    const id = blocksToProcess[i].id
    childrenContents = [
      ...childrenContents,
      ...(await getRecursiveBlockContent(id))
    ]
  }

  return [...blockContent, ...childrenContents.flat()]
}
