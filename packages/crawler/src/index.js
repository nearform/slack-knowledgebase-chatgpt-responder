import 'dotenv/config'

import * as ff from '@google-cloud/functions-framework'
import { generateCsv } from './csv.js'
import { fetchData } from './notion.js'
import { upload } from './file-upload.js'

ff.cloudEvent('crawl', cloudEvent => {
  const cmd = Buffer.from(cloudEvent.data.message.data, 'base64').toString()

  if (cmd === 'start_crawl') {
    fetchData().then(generateCsv).then(upload)
  }
})
