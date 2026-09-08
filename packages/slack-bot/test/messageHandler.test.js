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
// Transcription can fail outright as well as come back empty: Whisper rejects
// a body that is not audio, which is what a PDF or a screenshot upload gives
// it. Tests set transcriptionRejection to exercise that path.
const transcribeMock = sinon.spy(async () => {
  if (transcriptionRejection) {
    throw transcriptionRejection
  }
  // The real transcribe trims what it returns, so the empty string means "no
  // words were heard". Trimming here keeps the fake to that contract, which is
  // what the handler branches on. The trim itself is covered in
  // transcribe.test.js.
  return transcriptionResult.trim()
})

let answerFromGetAnswer = 'You book time off in the HR tool.'
let transcriptionResult = ''
let transcriptionRejection = null

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

// Makes one of the posts fail while the rest keep working, so a test can pick
// out the interim acknowledgement without failing the answer as well.
function rejectPostsMatching(client, pattern, error) {
  const succeedingPostMessage = client.chat.postMessage
  client.chat.postMessage = sinon.spy(async message => {
    if (pattern.test(message.text)) {
      throw error
    }
    return succeedingPostMessage(message)
  })
}

// An unhandled rejection is reported on the turn after the promise settles, so
// a fire-and-forget call with no catch has to be given that turn to blow up in
// before the test ends.
function settleFireAndForgetCalls() {
  return new Promise(resolve => setImmediate(resolve))
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

// The notice Slack sends when someone pins a message in the conversation.
const pinnedItemNoticeEvent = {
  type: 'message',
  subtype: 'pinned_item',
  user: 'U0000000000',
  text: '<@U0000000000> pinned a message to this conversation.',
  channel: 'D0000000000',
  channel_type: 'im',
  ts: '1700000000.000600'
}

// The subtype deny list is deliberately not an allow list, so a subtype we do
// not recognise is let through to be answered. This one carries neither text
// nor a file, which leaves nothing to answer and nobody waiting on a reply.
const unrecognisedSubtypeWithNothingToAnswerEvent = {
  type: 'message',
  subtype: 'some_subtype_slack_added_later',
  user: 'U0000000000',
  channel: 'D0000000000',
  channel_type: 'im',
  ts: '1700000000.000500'
}

beforeEach(() => {
  getAnswerMock.resetHistory()
  transcribeMock.resetHistory()
  answerFromGetAnswer = 'You book time off in the HR tool.'
  transcriptionResult = ''
  transcriptionRejection = null
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

  // The three Slack calls the handler deliberately does not wait on. Each one
  // used to be started with no catch, so a WebAPIPlatformError (already_reacted
  // on a Slack redelivery, msg_too_long, a 429 after retries) became an
  // unhandled rejection, which functions-framework turns into a process exit
  // that kills every in-flight request.
  test('answers anyway when the reaction it does not wait for is rejected', async t => {
    const client = createClientMock()
    const reactionError = new Error('already_reacted')
    client.reactions.add = sinon.spy(async () => {
      throw reactionError
    })
    const consoleError = t.mock.method(console, 'error', () => {})

    await messageHandler({ event: typedQuestionEvent, client })
    await settleFireAndForgetCalls()

    t.assert.ok(
      postedMessages(client).includes(answerFromGetAnswer),
      'the answer should still be posted'
    )
    t.assert.ok(
      consoleError.mock.calls.some(call =>
        call.arguments.includes(reactionError)
      ),
      'the rejection should be logged rather than left unhandled'
    )
  })

  test('answers anyway when the interim acknowledgement is rejected', async t => {
    const client = createClientMock()
    const postError = new Error('msg_too_long')
    rejectPostsMatching(client, /Thanks for your question/, postError)
    const consoleError = t.mock.method(console, 'error', () => {})

    await messageHandler({ event: typedQuestionEvent, client })
    await settleFireAndForgetCalls()

    t.assert.ok(
      postedMessages(client).includes(answerFromGetAnswer),
      'the answer should still be posted'
    )
    t.assert.ok(
      consoleError.mock.calls.some(call => call.arguments.includes(postError)),
      'the rejection should be logged rather than left unhandled'
    )
  })

  test('answers anyway when the transcription acknowledgement is rejected', async t => {
    transcriptionResult = 'How do I book time off?'
    const client = createClientMock()
    const postError = new Error('msg_too_long')
    rejectPostsMatching(client, /You asked/, postError)
    const consoleError = t.mock.method(console, 'error', () => {})

    await messageHandler({ event: voiceNoteEvent, client })
    await settleFireAndForgetCalls()

    t.assert.ok(
      postedMessages(client).includes(answerFromGetAnswer),
      'the answer should still be posted'
    )
    t.assert.ok(
      consoleError.mock.calls.some(call => call.arguments.includes(postError)),
      'the rejection should be logged rather than left unhandled'
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

  // A person pinning one of the bot's answers in the DM. The notice carries a
  // real user and real text, so without the subtype guard the bot reacted,
  // acknowledged, and asked the model to answer "pinned a message to this
  // conversation".
  test('leaves no trace on the notice a pinned message produces', async t => {
    const client = createClientMock()

    await messageHandler({ event: pinnedItemNoticeEvent, client })

    sinon.assert.notCalled(getAnswerMock)
    sinon.assert.notCalled(client.reactions.add)
    t.assert.deepStrictEqual(postedMessages(client), [])
  })

  test('leaves no trace when an unrecognised subtype carries nothing to answer', async t => {
    const client = createClientMock()

    await messageHandler({
      event: unrecognisedSubtypeWithNothingToAnswerEvent,
      client
    })

    sinon.assert.notCalled(getAnswerMock)
    sinon.assert.notCalled(client.reactions.add)
    sinon.assert.notCalled(client.chat.postMessage)
    t.assert.deepStrictEqual(postedMessages(client), [])
  })

  test('transcribes a voice note and answers what was said', async t => {
    // Whisper's text format newline-terminates what it returns, and transcribe
    // trims it, so what reaches getAnswer and the acknowledgement is the words
    // and nothing else.
    transcriptionResult = 'How do I book time off?\n'
    const client = createClientMock()

    await messageHandler({ event: voiceNoteEvent, client })

    sinon.assert.calledOnce(transcribeMock)
    t.assert.strictEqual(
      transcribeMock.firstCall.args[0],
      voiceNoteEvent.files[0]
    )

    sinon.assert.calledOnce(getAnswerMock)
    const askedQuestion = getAnswerMock.firstCall.args[0].question
    t.assert.strictEqual(askedQuestion, 'How do I book time off?')
    t.assert.strictEqual(
      askedQuestion,
      askedQuestion.trim(),
      'no trailing whitespace should reach getAnswer'
    )

    const posted = postedMessages(client)
    t.assert.ok(
      posted.some(text =>
        text.includes('You asked: "How do I book time off?"')
      ),
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

  // Whisper with response_format: 'text' returns only whitespace for audio
  // that contains no speech, and a whitespace-only string is truthy, so the
  // "we heard something" path was taken with nothing in it. transcribe now
  // trims, and this covers the whole way through the handler.
  test('treats a recording that transcribes to only whitespace as no words heard', async t => {
    transcriptionResult = ' \n '
    const client = createClientMock()

    await messageHandler({ event: voiceNoteEvent, client })

    const posted = postedMessages(client)
    t.assert.strictEqual(
      posted.length,
      1,
      `exactly one message should be posted, got ${JSON.stringify(posted)}`
    )
    t.assert.match(posted[0], /could not make out any words in that recording/i)
    t.assert.ok(
      !posted.includes(genericErrorResponse),
      'whitespace from the transcriber is not an internal failure'
    )

    sinon.assert.notCalled(getAnswerMock)
  })

  test('keeps the typed question when the transcription is only whitespace', async t => {
    transcriptionResult = ' \n '
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
    t.assert.ok(
      !postedMessages(client).includes(genericErrorResponse),
      'the typed question is answerable, so nothing has gone wrong'
    )
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

  // A user attaches a PDF or a screenshot and types the question alongside it.
  // Whisper rejects the non-audio body, which is a failure of the file, not of
  // the question sitting in event.text.
  test('falls back to the text alongside a file when the transcription fails', async t => {
    transcriptionRejection = new Error('Whisper rejected the uploaded file')
    const client = createClientMock()

    await messageHandler({
      event: { ...voiceNoteEvent, text: 'How do I book time off?' },
      client
    })

    sinon.assert.calledOnce(transcribeMock)
    sinon.assert.calledOnce(getAnswerMock)
    t.assert.strictEqual(
      getAnswerMock.firstCall.args[0].question,
      'How do I book time off?'
    )

    const posted = postedMessages(client)
    t.assert.ok(
      posted.includes(answerFromGetAnswer),
      `the answer should be posted, got ${JSON.stringify(posted)}`
    )
    t.assert.ok(
      !posted.includes(genericErrorResponse),
      'the typed question is answerable, so nothing has gone wrong'
    )
  })

  // The boundary of the fallback above: with nothing typed there is no question
  // to fall back on, so a failed transcription stays an internal failure.
  test('reports the generic error when the transcription fails and nothing was typed', async t => {
    transcriptionRejection = new Error('Whisper rejected the uploaded file')
    const client = createClientMock()

    await messageHandler({ event: voiceNoteEvent, client })

    sinon.assert.calledOnce(transcribeMock)
    sinon.assert.notCalled(getAnswerMock)

    const posted = postedMessages(client)
    t.assert.ok(
      posted.includes(genericErrorResponse),
      `the generic error should be posted, got ${JSON.stringify(posted)}`
    )
  })
})
