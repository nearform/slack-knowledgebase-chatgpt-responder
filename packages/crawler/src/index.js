import 'dotenv/config'

import * as ff from '@google-cloud/functions-framework'
import { generateCsv } from './csv.js'
import { fetchData } from './notion.js'
import { upload } from './file-upload.js'

export const CMD = 'start_crawl'

export const crawl = async cmd => {
  if (cmd === CMD) {
    await fetchData().then(generateCsv).then(upload)
  } else {
    console.log(`noop, received "${cmd}" command`)
  }
}

ff.cloudEvent('crawl', cloudEvent => {
  const cmd = Buffer.from(cloudEvent.data.message.data, 'base64').toString()
  crawl(cmd)
})
