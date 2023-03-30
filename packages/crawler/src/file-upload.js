import path from 'node:path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import stream from 'stream'
import { Storage } from '@google-cloud/storage'

function isLocalEnvironment() {
  // @TODO Find an appropriate env var to tell prod environment
  const { FUNCTION_REGION } = process.env
  return !FUNCTION_REGION
}

function getCurrentDirectoryPath() {
  const __filename = fileURLToPath(import.meta.url)
  return path.dirname(__filename)
}

function writeFileToSharedCache(content, fileName) {
  fs.writeFileSync(
    path.resolve(getCurrentDirectoryPath(), '../../../.cache/', fileName),
    content
  )
}

export const upload = csv => {
  if (isLocalEnvironment()) {
    writeFileToSharedCache(csv, 'scraped.csv')
    return
  }

  const bucketName = process.env.GCP_STORAGE_BUCKET_NAME || ''
  const destFileName =
    process.env.GCP_STORAGE_SCRAPED_FILE_NAME || 'scraped.csv'

  const storage = new Storage()

  const myBucket = storage.bucket(bucketName)
  const file = myBucket.file(destFileName)

  const passthroughStream = new stream.PassThrough()
  passthroughStream.write(csv)
  passthroughStream.end()

  async function streamFileUpload() {
    passthroughStream
      .pipe(file.createWriteStream())
      .on('finish', () => {
        console.log('Upload completed!')
      })
      .on('error', e => console.error('Upload failed with error: ', e))
  }

  streamFileUpload().catch(console.error)
}
