import stream from 'stream'
import { Storage } from '@google-cloud/storage'

export const upload = csv => {
  const bucketName = process.env.GC_STORAGE_BUCKET_NAME || ''
  const destFileName = process.env.FILE_NAME || 'notion.csv'

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
