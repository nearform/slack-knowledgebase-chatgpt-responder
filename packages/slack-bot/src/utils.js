import fs from 'node:fs'
import path from 'node:path'
import { Storage } from '@google-cloud/storage'
import { findRootSync } from '@manypkg/find-root'
import { parse } from 'csv-parse/sync'
import cosineSimilarity from 'compute-cosine-similarity'

const { rootDir } = findRootSync(process.cwd())
const rootCache = path.join(rootDir, '.cache')

export const isLocalEnvironment = Boolean(process.env.IS_LOCAL_ENVIRONMENT)

/**
 * Download a remote bucket file to a local destination
 */
export async function download(bucketName, fileName, destination) {
  if (isLocalEnvironment) {
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

/**
 * @param {Object} args
 * @param {number[]} args.queryEmbedding
 * @param {number[][]} args.embeddings
 * @returns {index: number, distance: number}[]
 */
export function distancesFromEmbeddings({ queryEmbedding, embeddings }) {
  const distance = embeddings.map((embedding, index) => ({
    index,
    // We're replicating the output returned from Python's scipy library
    // https://github.com/openai/openai-python/blob/cf03fe16a92cd01f2a8867537399c12e183ba58e/openai/embeddings_utils.py#L141
    distance: 1 - cosineSimilarity(queryEmbedding, embedding)
  }))
  return distance
}
