import 'dotenv/config'

import { generateCsv } from './csv.js'
import { fetchData } from './notion.js'
import { upload } from './file-upload.js'

export const crawl = () => {
  return fetchData()
    .then(generateCsv)
    .then(upload)
    .catch(err => {
      console.error(err)
      process.exit(1)
    })
}
