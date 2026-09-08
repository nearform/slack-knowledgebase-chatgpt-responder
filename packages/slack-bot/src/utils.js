import fs from 'node:fs/promises'
import f from 'node:fs'
import path from 'node:path'
import os from 'node:os'
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

/**
 * How long the audio download may take before it is abandoned. Slack accepting
 * the connection and then sending nothing used to leave the message handler
 * waiting on a promise that could never settle.
 */
const audioDownloadTimeoutMs = 30_000

/**
 * Download the audio a Slack file points at to a local scratch file.
 *
 * Every failure has to reject: the request failing to connect, the response
 * breaking part way through, the file failing to write, the response stalling,
 * and a non-2xx answer such as the error body an expired or forbidden download
 * URL serves. Unlistened-for stream errors were uncaught exceptions, which
 * functions-framework turns into a process exit that takes every in-flight
 * request with it.
 *
 * @param {string} url the file's `url_private_download`
 * @param {string} id the Slack file id, used to name the scratch file
 * @returns {Promise<string>} the path the audio was written to
 */
export async function downloadAudio(url, id) {
  const slackUrl = new URL(url)
  // The working directory of a Cloud Run instance is an in-memory filesystem
  // charged against the instance memory limit, so a scratch file belongs in
  // the temporary directory instead.
  const destination = path.join(os.tmpdir(), `${id}.mp4`)

  return new Promise((resolve, reject) => {
    const request = https.get(
      {
        hostname: slackUrl.hostname,
        path: slackUrl.pathname,
        headers: {
          authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`
        },
        timeout: audioDownloadTimeoutMs
      },
      response => {
        const { statusCode } = response
        if (!statusCode || statusCode < 200 || statusCode >= 300) {
          // Drain and abandon it: writing an error body to disk and handing it
          // to Whisper as though it were audio helps nobody.
          response.resume()
          request.destroy()
          reject(
            new Error(
              `downloading the audio failed with HTTP status ${statusCode}`
            )
          )
          return
        }

        const audioFile = f.createWriteStream(destination)
        response.on('error', reject)
        audioFile.on('error', reject)
        audioFile.on('finish', () => {
          resolve(destination)
        })
        response.pipe(audioFile)
      }
    )

    request.on('error', reject)
    request.on('timeout', () => {
      // A timeout does not close the socket by itself, and destroying with an
      // error is what turns it into a rejection through the listener above.
      request.destroy(
        new Error(
          `downloading the audio timed out after ${audioDownloadTimeoutMs}ms`
        )
      )
    })
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
  const downloadedPath = await downloadAudio(file.url_private_download, file.id)
  const audioStream = f.createReadStream(downloadedPath)
  // The SDK reads the stream to upload it, but a rejection before it gets
  // there leaves the stream open, and it would then fail on the file removed
  // below with nothing listening for the error.
  audioStream.on('error', error => {
    console.error('could not read the downloaded audio', error)
  })

  try {
    const transcription = await openai.audio.transcriptions.create({
      file: audioStream,
      model: 'whisper-1',
      response_format: 'text'
    })
    return transcriptionText(transcription)
  } finally {
    audioStream.destroy()
    // The caller only ever sees the transcription, so cleaning up has to
    // happen here. The service runs with --min-instances=1 on a 512MB Cloud
    // Run instance, where the filesystem is memory and an instance lives
    // indefinitely: one file left behind per upload grows until the instance
    // is OOM-killed. A rejected transcription leaks just as readily as a
    // successful one, hence the finally.
    await fs.unlink(downloadedPath).catch(error => {
      // Already gone is the outcome we wanted. Anything else is worth knowing
      // about but must not replace the transcription result or its failure.
      if (error.code !== 'ENOENT') {
        console.error('could not remove the downloaded audio', error)
      }
    })
  }
}
