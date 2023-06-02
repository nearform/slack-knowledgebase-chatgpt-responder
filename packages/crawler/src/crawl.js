import fs from 'node:fs/promises'
import 'dotenv/config'

import { fetchData } from './notion.js'
import { upload, createCsv } from './utils.js'

const { GCP_STORAGE_BUCKET_NAME, GCP_STORAGE_SCRAPED_FILE_NAME } = process.env

export const crawl = async () => {
  try {
    const data = await fetchData()
    const csvData = await createCsv(data)
    await fs.writeFile(GCP_STORAGE_SCRAPED_FILE_NAME, csvData)
    await upload(GCP_STORAGE_BUCKET_NAME, GCP_STORAGE_SCRAPED_FILE_NAME)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}
