import { describe, test } from 'node:test'
import {
  carriesQuestion,
  hasFileAttachment,
  hasQuestionText,
  isPlainUserMessage
} from '../src/messageEvents.js'

// The event that caused the bot to answer its own default question: Slack
// unfurled a link in the bot's answer and sent the edit back as a
// message_changed event, whose text lives at event.message.text.
const linkUnfurlEvent = {
  type: 'message',
  subtype: 'message_changed',
  message: {
    bot_id: 'B0000000000',
    text: 'To get access, you should install <https://example.com/handbook>'
  },
  hidden: true,
  channel: 'D0000000000',
  channel_type: 'im',
  ts: '1700000000.000100'
}

const userQuestionEvent = {
  type: 'message',
  user: 'U0000000000',
  text: 'How do I book time off?',
  channel: 'D0000000000',
  channel_type: 'im',
  ts: '1700000000.000200'
}

describe('isPlainUserMessage', () => {
  test('accepts a plain direct message from a person', t => {
    t.assert.strictEqual(isPlainUserMessage(userQuestionEvent), true)
  })

  test('rejects the message_changed event a link unfurl produces', t => {
    t.assert.strictEqual(isPlainUserMessage(linkUnfurlEvent), false)
  })

  test('rejects a bot_message, as the previous guard did', t => {
    t.assert.strictEqual(
      isPlainUserMessage({ ...userQuestionEvent, subtype: 'bot_message' }),
      false
    )
  })

  test('rejects every other subtype it has not been told about', t => {
    const otherSubtypes = [
      'message_deleted',
      'message_replied',
      'channel_join',
      'thread_broadcast',
      'file_share'
    ]

    for (const subtype of otherSubtypes) {
      t.assert.strictEqual(
        isPlainUserMessage({ ...userQuestionEvent, subtype }),
        false,
        `expected the ${subtype} subtype to be ignored`
      )
    }
  })

  test('rejects an event carrying a bot_id even with no subtype', t => {
    t.assert.strictEqual(
      isPlainUserMessage({ ...userQuestionEvent, bot_id: 'B0000000000' }),
      false
    )
  })

  test('rejects a hidden event even with no subtype and no bot_id', t => {
    t.assert.strictEqual(
      isPlainUserMessage({ ...userQuestionEvent, hidden: true }),
      false
    )
  })

  test('rejects a missing event rather than throwing', t => {
    t.assert.strictEqual(isPlainUserMessage(undefined), false)
  })
})

describe('hasQuestionText', () => {
  test('accepts text a person typed', t => {
    t.assert.strictEqual(hasQuestionText(userQuestionEvent), true)
  })

  test('rejects an absent text field', t => {
    t.assert.strictEqual(
      hasQuestionText({ ...userQuestionEvent, text: undefined }),
      false
    )
  })

  test('rejects an empty text field', t => {
    t.assert.strictEqual(
      hasQuestionText({ ...userQuestionEvent, text: '' }),
      false
    )
  })

  test('rejects text that is only whitespace', t => {
    t.assert.strictEqual(
      hasQuestionText({ ...userQuestionEvent, text: '   \n\t ' }),
      false
    )
  })

  test('does not read the text a message_changed event nests', t => {
    // event.message.text is where the unfurled copy keeps its text. Reading it
    // is what would make the bot answer its own message.
    t.assert.strictEqual(hasQuestionText(linkUnfurlEvent), false)
  })
})

describe('hasFileAttachment', () => {
  test('accepts an event with a file to transcribe', t => {
    t.assert.strictEqual(
      hasFileAttachment({ ...userQuestionEvent, files: [{ id: 'F000' }] }),
      true
    )
  })

  test('rejects an event with no files field', t => {
    t.assert.strictEqual(hasFileAttachment(userQuestionEvent), false)
  })

  test('rejects an event with an empty files array', t => {
    t.assert.strictEqual(
      hasFileAttachment({ ...userQuestionEvent, files: [] }),
      false
    )
  })
})

describe('carriesQuestion', () => {
  test('accepts typed text with no files', t => {
    t.assert.strictEqual(carriesQuestion(userQuestionEvent), true)
  })

  test('accepts a file with no text, which transcription may turn into one', t => {
    t.assert.strictEqual(
      carriesQuestion({
        ...userQuestionEvent,
        text: '',
        files: [{ id: 'F000' }]
      }),
      true
    )
  })

  test('rejects an event with neither text nor a file', t => {
    t.assert.strictEqual(
      carriesQuestion({ ...userQuestionEvent, text: '' }),
      false
    )
  })
})
