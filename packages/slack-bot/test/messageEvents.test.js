import { describe, test } from 'node:test'
import {
  carriesQuestion,
  hasFileAttachment,
  hasQuestionText,
  isPlainUserMessage,
  isTranscribableFile
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

// A voice note recorded in a DM. Slack delivers a person's file upload as a
// message event with the file_share subtype, an empty text and the file in
// event.files, which is the shape the transcription branch in bot.js exists
// for.
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
      name: 'audio_message.webm',
      mimetype: 'audio/webm',
      subtype: 'slack_audio',
      url_private_download:
        'https://files.slack.com/files-pri/T0000000000-F0000000000/download/audio_message.webm'
    }
  ]
}

// A person pinning one of the bot's answers in the DM. Slack sends this on the
// message.im subscription with a real user, real text, no bot_id and no
// hidden, so nothing but the deny list stands between a pin notice and the bot
// asking the model to answer it.
const pinnedItemNoticeEvent = {
  type: 'message',
  subtype: 'pinned_item',
  user: 'U0000000000',
  text: '<@U0000000000> pinned a message to this conversation.',
  channel: 'D0000000000',
  channel_type: 'im',
  ts: '1700000000.000600'
}

// A reminder notice, the same shape of thing from the same subscription.
const reminderAddNoticeEvent = {
  type: 'message',
  subtype: 'reminder_add',
  user: 'U0000000000',
  text: 'Reminder: read the handbook.',
  channel: 'D0000000000',
  channel_type: 'im',
  ts: '1700000000.000700'
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

  // The two fixtures below are written out rather than derived from the deny
  // list, because the enumeration test that follows them is a copy of that
  // list and so cannot notice a subtype missing from it.
  test('rejects the pin notice a person pinning an answer produces', t => {
    t.assert.strictEqual(isPlainUserMessage(pinnedItemNoticeEvent), false)

    // Without the subtype guard this notice would be answered: it reads as a
    // question as far as everything else here is concerned.
    t.assert.strictEqual(carriesQuestion(pinnedItemNoticeEvent), true)
  })

  test('rejects a reminder notice', t => {
    t.assert.strictEqual(isPlainUserMessage(reminderAddNoticeEvent), false)
    t.assert.strictEqual(carriesQuestion(reminderAddNoticeEvent), true)
  })

  test('rejects every subtype on the deny list', t => {
    const deniedSubtypes = [
      'bot_message',
      'message_changed',
      'message_deleted',
      'message_replied',
      'tombstone',
      'ekm_access_denied',
      'pinned_item',
      'unpinned_item',
      'reminder_add',
      'huddle_thread',
      'bot_add',
      'bot_remove',
      'sh_room_created',
      'app_conversation_join',
      'channel_join',
      'channel_leave',
      'channel_topic',
      'channel_purpose',
      'channel_name',
      'channel_archive',
      'channel_unarchive',
      'group_join',
      'group_leave',
      'group_topic',
      'group_purpose',
      'group_name',
      'group_archive',
      'group_unarchive'
    ]

    for (const subtype of deniedSubtypes) {
      t.assert.strictEqual(
        isPlainUserMessage({ ...userQuestionEvent, subtype }),
        false,
        `expected the ${subtype} subtype to be ignored`
      )
    }
  })

  test('accepts the subtypes that are still a person speaking', t => {
    // file_share is a file or voice note someone uploaded, thread_broadcast is
    // a threaded reply also sent to the channel, and me_message is a /me
    // message. All three keep their text at event.text and are questions the
    // bot should answer.
    const userSubtypes = ['file_share', 'thread_broadcast', 'me_message']

    for (const subtype of userSubtypes) {
      t.assert.strictEqual(
        isPlainUserMessage({ ...userQuestionEvent, subtype }),
        true,
        `expected the ${subtype} subtype to be answered`
      )
    }
  })

  test('accepts an unrecognised subtype, so an unknown behaves as before', t => {
    // The list is a deny list on purpose. A subtype nobody here has seen keeps
    // the behaviour this fix started from, an answered message, rather than
    // becoming a new silent failure.
    t.assert.strictEqual(
      isPlainUserMessage({
        ...userQuestionEvent,
        subtype: 'a_subtype_slack_has_not_shipped_yet'
      }),
      true
    )
  })

  test('accepts a voice note a person recorded in a DM', t => {
    t.assert.strictEqual(isPlainUserMessage(voiceNoteEvent), true)
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

describe('isTranscribableFile', () => {
  test('accepts the voice note Slack records in a DM', t => {
    t.assert.strictEqual(isTranscribableFile(voiceNoteEvent.files[0]), true)
  })

  test('accepts a voice note recognised by its subtype alone', t => {
    // Slack marks its own voice notes with subtype: 'slack_audio', which is
    // the more reliable of the two signals.
    t.assert.strictEqual(
      isTranscribableFile({
        id: 'F0000000000',
        subtype: 'slack_audio',
        url_private_download: 'https://files.slack.com/audio_message.webm'
      }),
      true
    )
  })

  test('rejects a document, which has no audio to transcribe', t => {
    // A PDF or a screenshot was downloaded and uploaded to OpenAI's audio
    // endpoint for nothing before Whisper rejected it, which for confidential
    // client content is a send that should never have happened.
    t.assert.strictEqual(
      isTranscribableFile({
        id: 'F0000000001',
        name: 'contract.pdf',
        mimetype: 'application/pdf',
        url_private_download: 'https://files.slack.com/contract.pdf'
      }),
      false
    )
  })

  test('rejects a video, whose soundtrack is not the question', t => {
    // Whisper accepts a screen recording's audio track, so this one
    // transcribed successfully and overwrote the question the person typed.
    t.assert.strictEqual(
      isTranscribableFile({
        id: 'F0000000002',
        name: 'screen-recording.mp4',
        mimetype: 'video/mp4',
        url_private_download: 'https://files.slack.com/screen-recording.mp4'
      }),
      false
    )
  })

  test('rejects an audio file Slack served no download URL for', t => {
    // Slack Connect and restricted files arrive as a stub, and hidden_by_limit
    // and external-mode files lack the URL too. new URL(undefined) threw a
    // TypeError, which surfaced as the generic internal failure.
    t.assert.strictEqual(
      isTranscribableFile({
        id: 'F0000000003',
        mimetype: 'audio/webm',
        file_access: 'check_file_info'
      }),
      false
    )
    t.assert.strictEqual(
      isTranscribableFile({
        id: 'F0000000003',
        mimetype: 'audio/webm',
        url_private_download: ''
      }),
      false
    )
  })

  test('rejects a missing file rather than throwing', t => {
    t.assert.strictEqual(isTranscribableFile(undefined), false)
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

  test('accepts the voice note event, whose question is in the audio', t => {
    t.assert.strictEqual(carriesQuestion(voiceNoteEvent), true)
  })

  test('rejects an event with neither text nor a file', t => {
    t.assert.strictEqual(
      carriesQuestion({ ...userQuestionEvent, text: '' }),
      false
    )
  })
})
