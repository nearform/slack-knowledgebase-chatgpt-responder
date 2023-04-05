import path from 'node:path'
import { Storage } from '@google-cloud/storage'
import { findRootSync } from '@manypkg/find-root'
import fs from 'node:fs/promises'

const { rootDir } = findRootSync(process.cwd())
const rootCache = path.join(rootDir, '.cache')

function isLocalEnvironment() {
  const { FUNCTION_REGION } = process.env
  return !FUNCTION_REGION
}

export async function download(bucketName, fileName, scrapedFileName) {
  if (isLocalEnvironment()) {
    await fs.copyFile(path.resolve(rootCache, fileName), scrapedFileName)
  } else {
    const storage = new Storage()
    const bucket = storage.bucket(bucketName)
    const file = bucket.file(fileName)
    await file.download({ destination: fileName })
  }
}

export async function upload(bucketName, fileName) {
  if (isLocalEnvironment()) {
    await fs.copyFile(fileName, path.resolve(rootCache, fileName))
  } else {
    const storage = new Storage()
    const bucket = storage.bucket(bucketName)
    await bucket.upload(fileName)
  }
  console.log('Upload completed!')
}
