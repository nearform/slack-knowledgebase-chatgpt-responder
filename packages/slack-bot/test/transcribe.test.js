import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { after, before, describe, test, mock } from 'node:test'
import sinon from 'sinon'

// transcribe downloads the audio over HTTPS before handing it to OpenAI, so
// node:https is the one thing that has to be faked. Writing and reading the
// downloaded file stay real, into a temporary directory. mock.module registers
// a specifier once per process, which is why this lives in a test file of its
// own.
const httpsGetMock = sinon.spy((options, onResponse) => {
  const response = new PassThrough()
  onResponse(response)
  response.end('fake audio bytes')
  return response
})

mock.module('node:https', { defaultExport: { get: httpsGetMock } })

const { transcribe, transcriptionText } = await import('../src/utils.js')

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

let previousWorkingDirectory
let downloadDirectory

before(async () => {
  // downloadAudio writes ./<file id>.mp4 relative to the working directory.
  previousWorkingDirectory = process.cwd()
  downloadDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'slack-bot-transcribe-')
  )
  process.chdir(downloadDirectory)
})

after(async () => {
  process.chdir(previousWorkingDirectory)
  await fs.rm(downloadDirectory, { recursive: true, force: true })
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
})

describe('transcriptionText', () => {
  test('returns a plain string response unchanged', t => {
    t.assert.strictEqual(transcriptionText(spokenQuestion), spokenQuestion)
  })

  test('returns the empty string a silent recording transcribes to', t => {
    t.assert.strictEqual(transcriptionText(''), '')
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
