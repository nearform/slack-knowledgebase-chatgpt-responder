import 'dotenv/config'

import * as ff from '@google-cloud/functions-framework'
import { generateCsv } from './csv.js'
import { fetchData } from './notion.js'
import { upload } from './file-upload.js'

const CMD = 'start_crawl'

ff.cloudEvent('crawl', cloudEvent => {
  const cmd = Buffer.from(cloudEvent.data.message.data, 'base64').toString()

  if (cmd === CMD) {
    fetchData().then(generateCsv).then(upload)
  } else {
    console.log(`noop, received "${cmd}" command`)
  }
})
