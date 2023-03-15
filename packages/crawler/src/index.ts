import dotenv from 'dotenv'
dotenv.config()

import * as ff from '@google-cloud/functions-framework'
import { generateCsv } from './csv'
import { fetchData } from './notion'
import { upload } from './file-upload'

ff.http('crawl', (req, res) => {
  fetchData()
    .then(generateCsv)
    .then(csv => {
      upload(csv)
      res.send('Upload started!')
    })
})
