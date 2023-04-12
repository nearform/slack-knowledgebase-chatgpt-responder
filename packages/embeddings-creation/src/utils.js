import path from 'node:path'
import fs from 'node:fs/promises'
import { Storage } from '@google-cloud/storage'
import { findRootSync } from '@manypkg/find-root'
import { csv2json, json2csv } from 'json-2-csv'

const { rootDir } = findRootSync(process.cwd())
const rootCache = path.join(rootDir, '.cache')

export const isLocalEnvironment = Boolean(process.env.IS_LOCAL_ENVIRONMENT)

/**
 * Download a remote bucket file to a local destination
 */
export async function download(bucketName, fileName, destination) {
  if (isLocalEnvironment) {
    await fs.copyFile(path.resolve(rootCache, fileName), destination)
  } else {
    const storage = new Storage()
    const bucket = storage.bucket(bucketName)
    const file = bucket.file(fileName)
    await file.download({ destination: fileName })
  }
}

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

export async function createCsv(data) {
  return json2csv(data)
}

export async function parseCsv(data) {
  return csv2json(data)
}
