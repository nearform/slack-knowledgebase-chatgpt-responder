import path from 'node:path'
import { Storage } from '@google-cloud/storage'
import { findRootSync } from '@manypkg/find-root'
import fs from 'node:fs/promises'

const { rootDir } = findRootSync(process.cwd())
const rootCache = path.join(rootDir, '.cache')

export const isLocalEnvironment = Boolean(process.env.IS_LOCAL_ENVIRONMENT)

/**
 * Upload local file to a remote bucket
 */
export async function upload(bucketName, fileName) {
  if (isLocalEnvironment) {
    await fs.copyFile(fileName, path.resolve(rootCache, fileName))
  } else {
    const storage = new Storage()
    const bucket = storage.bucket(bucketName)
    await bucket.upload(fileName)
  }
}
