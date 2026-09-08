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
    await file.download({ destination })
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

/**
 * The text of a transcription, whatever shape the SDK returned it in.
 *
 * With `response_format: 'text'` the SDK resolves to the transcription as a
 * plain string, so reading `.text` off it gave `undefined`. Other formats
 * resolve to an object carrying `text`. Both are handled here rather than in
 * the caller, so changing the format cannot quietly return nothing again, and
 * anything else gives the empty string a silent recording would.
 *
 * @param {string | { text?: string } | undefined} transcription
 * @returns {string}
 */
export function transcriptionText(transcription) {
  if (typeof transcription === 'string') {
    return transcription
  }
  if (transcription && typeof transcription.text === 'string') {
    return transcription.text
  }
  return ''
}

/**
 * Transcribe an audio file a person sent, such as a voice note.
 *
 * @param {*} file a Slack file from `event.files`
 * @param {import('openai').OpenAI} openai
 * @returns {Promise<string>} the transcription, or the empty string if the
 *   audio yielded no words
 */
export async function transcribe(file, openai) {
  const p = await downloadAudio(file.url_private_download, file.id)
  const transcription = await openai.audio.transcriptions.create({
    file: f.createReadStream(p),
    model: 'whisper-1',
    response_format: 'text'
  })
  return transcriptionText(transcription)
}
