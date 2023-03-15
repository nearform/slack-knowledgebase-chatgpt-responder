import 'dotenv/config'

import * as ff from '@google-cloud/functions-framework'
import { generateCsv } from './csv.js'
import { fetchData } from './notion.js'
import { upload } from './file-upload.js'

ff.http('crawl', (req, res) => {
  fetchData()
    .then(generateCsv)
    .then(csv => {
      upload(csv)
      res.send('Upload started!')
    })
})
