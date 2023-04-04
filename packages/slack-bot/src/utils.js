import fs from 'node:fs'
import path from 'node:path'
import { Storage } from '@google-cloud/storage'
import { findRootSync } from '@manypkg/find-root'
import { parse } from 'csv-parse/sync'

const { rootDir } = findRootSync(process.cwd())
const rootCache = path.join(rootDir, '.cache')

function isLocalEnvironment() {
  const { FUNCTION_REGION } = process.env
  return !FUNCTION_REGION
}

export async function download(bucketName, fileName, destination) {
  if (isLocalEnvironment()) {
    fs.copyFileSync(path.join(rootCache, fileName), destination)
    return
  }

  const storage = new Storage()
  const options = {
    destination
  }

  await storage.bucket(bucketName).file(fileName).download(options)
}

// @TODO Convert to Stream api if the case
export async function parseCsv(input) {
  const records = parse(input, {
    columns: true,
    skip_empty_lines: true
  })
  return records
}
