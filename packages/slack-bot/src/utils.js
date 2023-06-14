import fs from 'node:fs/promises'
import f from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import { Storage } from '@google-cloud/storage'
import { findRootSync } from '@manypkg/find-root'
import { csv2json } from 'json-2-csv'
import cosineSimilarity from 'compute-cosine-similarity'

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

export async function parseCsv(data) {
  return csv2json(data)
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

export async function downloadAudio(url, id) {
  return new Promise(resolve => {
    const u = new URL(url)
    const dest = `./${id}.mp4`
    https.get(
      {
        hostname: u.hostname,
        path: u.pathname,
        headers: {
          authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`
        }
      },
      res => {
        res.pipe(f.createWriteStream(dest)).on('finish', () => {
          resolve(dest)
        })
      }
    )
  })
}

export async function transcribe(file, openai) {
  const p = await downloadAudio(file.url_private_download, file.id)
  const transcribe = await openai.createTranscription(
    f.createReadStream(p),
    'whisper-1',
    undefined,
    'text'
  )
  return transcribe.data
}
