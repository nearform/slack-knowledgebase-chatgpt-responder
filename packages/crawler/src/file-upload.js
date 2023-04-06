import path from 'node:path'
import fs from 'fs'
import stream from 'stream'
import { Storage } from '@google-cloud/storage'
import { findRootSync } from '@manypkg/find-root'

const { rootDir } = findRootSync(process.cwd())
const rootCache = path.join(rootDir, '.cache')

export const isOnGoogleCloud = () =>
  Boolean(process.env.K_SERVICE && process.env.K_REVISION)

function writeFileToRootCache(content, fileName) {
  fs.writeFileSync(path.resolve(rootCache, fileName), content)
}

export const upload = csv => {
  if (!isOnGoogleCloud()) {
    writeFileToRootCache(csv, 'scraped.csv')
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
