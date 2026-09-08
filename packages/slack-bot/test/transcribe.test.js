import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { beforeEach, describe, test, mock } from 'node:test'
import sinon from 'sinon'

// transcribe downloads the audio over HTTPS before handing it to OpenAI, so
// node:https is the one thing that has to be faked. Writing and reading the
// downloaded file stay real, under the system temporary directory the download
// writes to. mock.module registers a specifier once per process, which is why
// this lives in a test file of its own.

function respondWithAudio(
  request,
  onResponse,
  { statusCode = 200, body = 'fake audio bytes' } = {}
) {
  const response = new PassThrough()
  response.statusCode = statusCode
  onResponse(response)
  response.end(body)
  return response
}

// What the faked https.get does once the caller has had its request object
// back, set per test. The default serves the audio successfully.
let respondToDownload = respondWithAudio

const httpsGetMock = sinon.spy((options, onResponse) => {
  const request = new EventEmitter()
  // ClientRequest.destroy(error) surfaces the error to the request's own
  // 'error' listeners, which is how a timeout becomes a rejection.
  request.destroy = sinon.spy(error => {
    if (error) {
      request.emit('error', error)
    }
  })
  // The real https.get returns the request before any response arrives, so a
  // listener registered after the call still sees the outcome.
  setImmediate(() => respondToDownload(request, onResponse))
  return request
})

mock.module('node:https', { defaultExport: { get: httpsGetMock } })

const { downloadAudio, transcribe, transcriptionText } =
  await import('../src/utils.js')

const audioFile = {
  id: 'F0000000000',
  url_private_download:
    'https://files.slack.com/files-pri/T0000000000-F0000000000/download/audio_message.webm'
}

const spokenQuestion = 'How do I book time off?'

function createOpenaiMock(transcriptionResponse) {
  // Collects what was actually uploaded, so the download half of transcribe is
  // exercised rather than assumed.
  const uploadedAudio = []

  return {
    uploadedAudio,
    audio: {
      transcriptions: {
        create: sinon.spy(async request => {
          // The real SDK reads the file stream to send it. Reading it here too
          // keeps the download honest and leaves nothing open when the test
          // ends.
          for await (const chunk of request.file) {
            uploadedAudio.push(chunk)
          }
          return transcriptionResponse
        })
      }
    }
  }
}

async function removeIfPresent(filePath) {
  await fs.rm(filePath, { force: true })
}

// Every scratch file downloadAudio could have written for one Slack file id.
// The name carries a per-invocation suffix, so a test asking whether anything
// was left behind has to look for the whole family rather than one fixed path.
async function leftoverAudioFiles(fileId) {
  const entries = await fs.readdir(os.tmpdir())
  return entries.filter(
    entry => entry.startsWith(`${fileId}`) && entry.endsWith('.mp4')
  )
}

async function removeLeftoverAudioFiles(fileId) {
  const leftovers = await leftoverAudioFiles(fileId)
  await Promise.all(
    leftovers.map(entry => removeIfPresent(path.join(os.tmpdir(), entry)))
  )
}

beforeEach(async () => {
  respondToDownload = respondWithAudio
  // The temporary directory outlives the test run, so a file an earlier run
  // leaked would otherwise be read as this run's leak.
  await removeLeftoverAudioFiles(audioFile.id)
})

describe('downloadAudio', () => {
  test('writes the audio under the system temporary directory', async t => {
    // The working directory of a Cloud Run instance is an in-memory
    // filesystem charged against the instance memory limit, and a scratch
    // file belongs in the temporary directory rather than beside the source.
    const downloadedPath = await downloadAudio(
      audioFile.url_private_download,
      audioFile.id
    )

    try {
      t.assert.strictEqual(
        path.dirname(downloadedPath),
        os.tmpdir(),
        'the download should not land in the working directory'
      )
      t.assert.strictEqual(
        await fs.readFile(downloadedPath, 'utf8'),
        'fake audio bytes'
      )
    } finally {
      await removeIfPresent(downloadedPath)
    }
  })

  test('rejects when the request itself fails', async t => {
    // files.slack.com unreachable: ENOTFOUND, ECONNRESET or a TLS failure. The
    // ClientRequest emits 'error', and with no listener for it that was an
    // uncaught exception which took the whole instance down.
    const connectionError = new Error('getaddrinfo ENOTFOUND files.slack.com')
    respondToDownload = request => {
      request.emit('error', connectionError)
    }

    await t.assert.rejects(
      downloadAudio(audioFile.url_private_download, audioFile.id),
      connectionError
    )
  })

  test('rejects when the response fails part way through', async t => {
    const responseError = new Error('aborted')
    respondToDownload = (request, onResponse) => {
      const response = new PassThrough()
      response.statusCode = 200
      onResponse(response)
      response.emit('error', responseError)
    }

    await t.assert.rejects(
      downloadAudio(audioFile.url_private_download, audioFile.id),
      responseError
    )
  })

  test('leaves nothing behind when the response fails part way through', async t => {
    // Slack's response aborting mid-download: ECONNRESET, a TLS reset, or the
    // platform cutting the connection. Rejecting was all that happened, and
    // pipe does not tear the destination down when the source fails, so the
    // partial file stayed on disk with its write handle still open. transcribe
    // cannot clean up after this one: downloadAudio throws before it ever
    // returns a path, so the caller's finally is never reached.
    const responseError = new Error('aborted')
    respondToDownload = (request, onResponse) => {
      const response = new PassThrough()
      response.statusCode = 200
      onResponse(response)
      // Bytes reach the write stream before the failure, which is what makes
      // this a leak rather than an empty file that was never opened.
      response.write('the first half of a voice note')
      setImmediate(() => response.destroy(responseError))
    }

    await t.assert.rejects(
      downloadAudio(audioFile.url_private_download, audioFile.id)
    )

    t.assert.deepStrictEqual(
      await leftoverAudioFiles(audioFile.id),
      [],
      'a download that failed mid-stream should leave no partial file behind'
    )
  })

  test('gives each download its own scratch file', async t => {
    // Slack redelivers an event it has not seen a 200 for, so two runs for the
    // same voice note can overlap. Sharing one destination had them writing
    // over each other, and now that each run removes the file when it is done
    // the first to finish would delete the other's download.
    const [first, second] = await Promise.all([
      downloadAudio(audioFile.url_private_download, audioFile.id),
      downloadAudio(audioFile.url_private_download, audioFile.id)
    ])

    try {
      t.assert.notStrictEqual(
        first,
        second,
        'two concurrent downloads of one file must not share a destination'
      )
    } finally {
      await removeIfPresent(first)
      await removeIfPresent(second)
    }
  })

  test('keeps the query string and port the download URL carries', async t => {
    // url_private_download is a signed URL: dropping its query string asks
    // Slack for a path that does not exist, and dropping the port sends the
    // request somewhere else entirely.
    const signedUrl =
      'https://files.slack.com:8443/files-pri/T0-F0/download/audio.webm?t=xoxe-1-abc&d=1'

    await removeIfPresent(await downloadAudio(signedUrl, audioFile.id))

    const [options] = httpsGetMock.lastCall.args
    t.assert.strictEqual(
      options.path,
      '/files-pri/T0-F0/download/audio.webm?t=xoxe-1-abc&d=1'
    )
    t.assert.strictEqual(options.port, '8443')
  })

  test('rejects when the downloaded file cannot be written', async t => {
    // The write stream error, which nothing listened for either.
    await t.assert.rejects(
      downloadAudio(
        audioFile.url_private_download,
        path.join('a-directory-that-does-not-exist', 'F0000000000')
      ),
      { code: 'ENOENT' }
    )
  })

  test('rejects when a stalled response times out', async t => {
    // Slack accepts the connection and then sends nothing. With no timeout the
    // promise never settled and the handler waited on it forever.
    respondToDownload = request => {
      request.emit('timeout')
    }

    await t.assert.rejects(
      downloadAudio(audioFile.url_private_download, audioFile.id),
      /timed out/i
    )
    sinon.assert.called(httpsGetMock.lastCall.returnValue.destroy)
  })

  test('asks for a request timeout, without which the timeout never fires', async t => {
    await removeIfPresent(
      await downloadAudio(audioFile.url_private_download, audioFile.id)
    )

    const [options] = httpsGetMock.lastCall.args
    t.assert.strictEqual(typeof options.timeout, 'number')
    t.assert.ok(options.timeout > 0, 'the timeout has to be a real deadline')
  })

  test('rejects a non-2xx response rather than writing the error body to disk', async t => {
    // An expired or forbidden Slack download URL answers with an error body,
    // which was written to disk and handed to Whisper as though it were audio.
    respondToDownload = (request, onResponse) => {
      respondWithAudio(request, onResponse, {
        statusCode: 403,
        body: 'expired signature'
      })
    }

    await t.assert.rejects(
      downloadAudio(audioFile.url_private_download, audioFile.id),
      /403/
    )
  })
})

describe('transcribe', () => {
  test('returns the transcription when the SDK resolves to a plain string', async t => {
    // What response_format: 'text' actually resolves to. Reading .text off it
    // returned undefined, and every voice note answered the old default
    // question instead of what the person said.
    const openai = createOpenaiMock(spokenQuestion)

    const result = await transcribe(audioFile, openai)

    t.assert.strictEqual(result, spokenQuestion)

    sinon.assert.calledOnce(openai.audio.transcriptions.create)
    const [request] = openai.audio.transcriptions.create.firstCall.args
    t.assert.strictEqual(request.model, 'whisper-1')
    t.assert.strictEqual(request.response_format, 'text')
    t.assert.strictEqual(
      Buffer.concat(openai.uploadedAudio).toString(),
      'fake audio bytes',
      'the audio Slack served should reach OpenAI'
    )
  })

  test('returns the transcription when the SDK resolves to an object carrying text', async t => {
    // The shape a different response_format, or a future SDK, returns.
    const openai = createOpenaiMock({ text: spokenQuestion })

    t.assert.strictEqual(await transcribe(audioFile, openai), spokenQuestion)
  })

  test('returns an empty string, never undefined, for an unusable response', async t => {
    const openai = createOpenaiMock(undefined)

    const result = await transcribe(audioFile, openai)

    t.assert.strictEqual(result, '')
    t.assert.strictEqual(
      typeof result,
      'string',
      'callers treat the result as text, so the type must not vary'
    )
  })

  // The service runs with --min-instances=1 on a 512MB Cloud Run instance, so
  // an instance lives indefinitely and the files it writes are held in its
  // memory. One file left behind per upload grows until the instance is
  // OOM-killed mid-request.
  test('removes the downloaded audio once the transcription has been read', async t => {
    const openai = createOpenaiMock(spokenQuestion)

    await transcribe(audioFile, openai)

    t.assert.deepStrictEqual(
      await leftoverAudioFiles(audioFile.id),
      [],
      'the downloaded audio should not outlive the transcription'
    )
  })

  test('removes the downloaded audio when the transcription throws', async t => {
    // Whisper rejects a body that is not audio, which is what a PDF or a
    // screenshot upload gives it. That path leaked its bytes too.
    const openai = createOpenaiMock(spokenQuestion)
    const whisperRejection = new Error('Whisper rejected the uploaded file')
    openai.audio.transcriptions.create = sinon.spy(async () => {
      throw whisperRejection
    })

    await t.assert.rejects(transcribe(audioFile, openai), whisperRejection)

    t.assert.deepStrictEqual(
      await leftoverAudioFiles(audioFile.id),
      [],
      'a failed transcription should not leave its download behind'
    )
  })

  test('tolerates the downloaded audio already being gone', async t => {
    const openai = createOpenaiMock(spokenQuestion)
    openai.audio.transcriptions.create = sinon.spy(async request => {
      // The read stream knows where the download went, which is the only way
      // to find it now that the name carries a per-invocation suffix.
      await removeIfPresent(request.file.path)
      return spokenQuestion
    })

    t.assert.strictEqual(await transcribe(audioFile, openai), spokenQuestion)
  })
})

describe('transcriptionText', () => {
  test('returns a plain string response unchanged', t => {
    t.assert.strictEqual(transcriptionText(spokenQuestion), spokenQuestion)
  })

  test('returns the empty string a silent recording transcribes to', t => {
    t.assert.strictEqual(transcriptionText(''), '')
  })

  // What Whisper actually returns for audio with no speech in it, and the
  // reason the documented "empty string if the audio yielded no words" was
  // false: a whitespace-only string is truthy, so every caller had to trim
  // again to find out whether any words were heard.
  test('returns the empty string for a whitespace-only transcription', t => {
    t.assert.strictEqual(transcriptionText('\n'), '')
    t.assert.strictEqual(transcriptionText('   '), '')
    t.assert.strictEqual(transcriptionText({ text: '\n' }), '')
  })

  test('trims the newline Whisper terminates its text with', t => {
    t.assert.strictEqual(
      transcriptionText(`${spokenQuestion}\n`),
      spokenQuestion
    )
  })

  test('reads text off an object response', t => {
    t.assert.strictEqual(
      transcriptionText({ text: spokenQuestion }),
      spokenQuestion
    )
  })

  test('returns an empty string for an object with no usable text', t => {
    t.assert.strictEqual(transcriptionText({ segments: [] }), '')
    t.assert.strictEqual(transcriptionText({ text: 42 }), '')
  })

  test('returns an empty string for a missing response', t => {
    t.assert.strictEqual(transcriptionText(undefined), '')
    t.assert.strictEqual(transcriptionText(null), '')
  })
})
