import { beforeEach, describe, test, mock } from 'node:test'
import sinon from 'sinon'

// bot.js builds an ExpressReceiver, a Bolt App and an OpenAI client as it
// loads, and registers the message listener on the App. Faking those three
// gives the listener itself, which is where the decisions this file is about
// are made. getAnswer.js and utils.js are faked as well: the first loads the
// embeddings as it imports, and transcribe in the second downloads the audio
// over the network. mock.module registers a specifier once per process, so this
// lives in its own test file.

const registeredEventHandlers = new Map()

// Mirrors the real getAnswer, which throws rather than inventing a question.
// Without that, a handler that reached it with nothing to ask would look fine
// here and post the generic error in production.
const getAnswerMock = sinon.spy(async ({ question }) => {
  if (typeof question !== 'string' || question.trim().length === 0) {
    throw new Error('getAnswer requires a question')
  }
  return answerFromGetAnswer
})
const transcribeMock = sinon.spy(async () => transcriptionResult)

let answerFromGetAnswer = 'You book time off in the HR tool.'
let transcriptionResult = ''

class AppMock {
  event(eventName, handler) {
    registeredEventHandlers.set(eventName, handler)
  }
  shortcut() {}
  error() {}
}

class ExpressReceiverMock {
  app = { get: () => {} }
}

mock.module('@slack/bolt', {
  defaultExport: { App: AppMock, ExpressReceiver: ExpressReceiverMock }
})

mock.module('openai', {
  defaultExport: class OpenAIMock {}
})

mock.module('../src/getAnswer.js', {
  namedExports: {
    getAnswer: getAnswerMock,
    initialize: async () => {}
  }
})

mock.module('../src/utils.js', {
  namedExports: { transcribe: transcribeMock }
})

await import('../src/bot.js')

const messageHandler = registeredEventHandlers.get('message')

// The generic failure message bot.js posts when something went wrong. Named
// here so a test can assert it was not the one a user got.
const genericErrorResponse =
  'It appears I have run into an issue looking up an answer for you. Please try again'

function createClientMock() {
  return {
    reactions: { add: sinon.spy(async () => {}) },
    users: {
      info: sinon.spy(async () => ({ user: { locale: 'en-GB' } }))
    },
    chat: { postMessage: sinon.spy(async () => {}) }
  }
}

function postedMessages(client) {
  return client.chat.postMessage.args.map(([message]) => message.text)
}

const typedQuestionEvent = {
  type: 'message',
  user: 'U0000000000',
  text: 'How do I book time off?',
  channel: 'D0000000000',
  channel_type: 'im',
  ts: '1700000000.000200'
}

const voiceNoteEvent = {
  type: 'message',
  subtype: 'file_share',
  user: 'U0000000000',
  text: '',
  channel: 'D0000000000',
  channel_type: 'im',
  ts: '1700000000.000300',
  files: [
    {
      id: 'F0000000000',
      mimetype: 'audio/webm',
      url_private_download:
        'https://files.slack.com/files-pri/T0000000000-F0000000000/download/audio_message.webm'
    }
  ]
}

// The event from issue #983: Slack unfurled a link in the bot's own answer and
// sent the edit back as a message event.
const linkUnfurlEvent = {
  type: 'message',
  subtype: 'message_changed',
  hidden: true,
  message: {
    bot_id: 'B0000000000',
    text: 'To get access, install <https://example.com/handbook>'
  },
  channel: 'D0000000000',
  channel_type: 'im',
  ts: '1700000000.000100'
}

// Another app posting into the DM. Unlike the unfurl above this one does carry
// top-level text, so the subtype guard is the only thing standing between it
// and an answer.
const otherBotMessageEvent = {
  type: 'message',
  subtype: 'bot_message',
  bot_id: 'B0000000001',
  text: 'Deploy finished successfully',
  channel: 'D0000000000',
  channel_type: 'im',
  ts: '1700000000.000400'
}

beforeEach(() => {
  getAnswerMock.resetHistory()
  transcribeMock.resetHistory()
  answerFromGetAnswer = 'You book time off in the HR tool.'
  transcriptionResult = ''
})

describe('the message handler', () => {
  test('registers itself for the message event', t => {
    t.assert.strictEqual(typeof messageHandler, 'function')
  })

  test('answers a question a person typed', async t => {
    const client = createClientMock()

    await messageHandler({ event: typedQuestionEvent, client })

    sinon.assert.calledOnce(getAnswerMock)
    t.assert.strictEqual(
      getAnswerMock.firstCall.args[0].question,
      typedQuestionEvent.text
    )
    t.assert.ok(
      postedMessages(client).includes(answerFromGetAnswer),
      'the answer should be posted'
    )
  })

  test('leaves no trace at all on the link unfurl of its own answer', async t => {
    const client = createClientMock()

    await messageHandler({ event: linkUnfurlEvent, client })

    sinon.assert.notCalled(getAnswerMock)
    sinon.assert.notCalled(client.reactions.add)
    sinon.assert.notCalled(client.chat.postMessage)
    t.assert.deepStrictEqual(postedMessages(client), [])
  })

  test('ignores another bot posting text into the DM', async t => {
    const client = createClientMock()

    await messageHandler({ event: otherBotMessageEvent, client })

    sinon.assert.notCalled(getAnswerMock)
    sinon.assert.notCalled(client.reactions.add)
    t.assert.deepStrictEqual(postedMessages(client), [])
  })

  test('transcribes a voice note and answers what was said', async t => {
    transcriptionResult = 'How do I book time off?'
    const client = createClientMock()

    await messageHandler({ event: voiceNoteEvent, client })

    sinon.assert.calledOnce(transcribeMock)
    t.assert.strictEqual(
      transcribeMock.firstCall.args[0],
      voiceNoteEvent.files[0]
    )

    sinon.assert.calledOnce(getAnswerMock)
    t.assert.strictEqual(
      getAnswerMock.firstCall.args[0].question,
      transcriptionResult
    )

    const posted = postedMessages(client)
    t.assert.ok(
      posted.some(text => text.includes(transcriptionResult)),
      'the acknowledgement should quote what was heard'
    )
    t.assert.ok(
      posted.includes(answerFromGetAnswer),
      'the answer should be posted'
    )
  })

  test('tells the user the audio was not understood rather than posting the generic error', async t => {
    transcriptionResult = ''
    const client = createClientMock()

    await messageHandler({ event: voiceNoteEvent, client })

    const posted = postedMessages(client)
    t.assert.strictEqual(
      posted.length,
      1,
      `exactly one message should be posted, got ${JSON.stringify(posted)}`
    )
    t.assert.match(posted[0], /could not make out any words in that recording/i)
    t.assert.match(posted[0], /type your question/i)
    t.assert.ok(
      !posted.includes(genericErrorResponse),
      'an unintelligible recording is not an internal failure'
    )

    // Nothing to ask, so nothing is asked. getAnswer now throws on a missing
    // question, which is what produced the generic error.
    sinon.assert.notCalled(getAnswerMock)
  })

  test('falls back to the text alongside a file when the audio yields nothing', async t => {
    transcriptionResult = ''
    const client = createClientMock()

    await messageHandler({
      event: { ...voiceNoteEvent, text: 'How do I book time off?' },
      client
    })

    sinon.assert.calledOnce(getAnswerMock)
    t.assert.strictEqual(
      getAnswerMock.firstCall.args[0].question,
      'How do I book time off?'
    )
    t.assert.ok(
      postedMessages(client).includes(answerFromGetAnswer),
      'the answer should be posted'
    )
  })
})
