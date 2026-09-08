/**
 * Decisions about which Slack `message` events the bot should answer, kept
 * apart from the handler so they can be tested without constructing a Bolt app.
 */

/**
 * Subtypes of the `message` event that are never a person asking something.
 *
 * A deny list rather than an allow list, deliberately. We are not confident we
 * know every subtype string Slack may send, and an unrecognised one is far
 * better answered, which is what the bot did before this guard existed, than
 * silently dropped. Getting an answer nobody expected is visible; getting no
 * answer at all looks like the bot is broken.
 *
 * The entries fall into two groups. `bot_message`, `message_changed`,
 * `message_deleted`, `message_replied`, `tombstone` and `ekm_access_denied`
 * are the bot's or the workspace's own doing, not a message anyone typed: a
 * link unfurl on the bot's own answer is the `message_changed` one, and it is
 * what issue #983 was about. The rest are notices Slack writes on someone's
 * behalf, whose text reads like "pinned a message to this conversation" or
 * "so-and-so joined the channel", which the model would happily answer as a
 * question. `pinned_item` through `app_conversation_join` are the ones that
 * can arrive on the `message.im` subscription the bot has today, and a pin on
 * one of the bot's own answers is the likeliest of them. The `channel_*` and
 * `group_*` entries cannot arrive on that subscription, and are kept because
 * they cost nothing and would matter the moment a channel subscription is
 * added.
 *
 * Subtypes that are still a person speaking are absent on purpose, so they are
 * answered: `file_share` (an upload, including a voice note, with the file in
 * `event.files`), `thread_broadcast` and `me_message` all keep their text at
 * `event.text`.
 */
const nonUserMessageSubtypes = new Set([
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
])

/**
 * Whether a `message` event is a plain message a person sent.
 *
 * Slack delivers far more than typed messages on this event. A link unfurl on
 * the bot's own answer arrives as a `message_changed` subtype with
 * `hidden: true`, and it keeps its text at `event.message.text`, alongside the
 * bot's own `bot_id`, so treating it as a question asks the model something
 * nobody asked. A `bot_id` or `hidden` at the top level is rejected whatever
 * the subtype, so that unfurl fails the deny list and the `hidden` check both.
 *
 * @param {Object} [event] a Slack `message` event
 * @returns {boolean}
 */
export function isPlainUserMessage(event) {
  return (
    Boolean(event) &&
    !nonUserMessageSubtypes.has(event.subtype) &&
    !event.bot_id &&
    !event.hidden
  )
}

/**
 * Whether the event carries text a person typed. Deliberately reads only
 * `event.text`: the nested `event.message.text` belongs to an edited or
 * unfurled message, which `isPlainUserMessage` rejects.
 *
 * @param {Object} event a Slack `message` event
 * @returns {boolean}
 */
export function hasQuestionText(event) {
  return typeof event.text === 'string' && event.text.trim().length > 0
}

/**
 * Whether the event carries a file at all, transcribable or not.
 *
 * Deliberately not narrowed to the files we can transcribe: a file we cannot
 * read is still something a person sent and is waiting on, so it has to reach
 * the handler and get a reaction and a reply. What we do with the file is
 * `isTranscribableFile`'s decision.
 *
 * @param {Object} event a Slack `message` event
 * @returns {boolean}
 */
export function hasFileAttachment(event) {
  return Boolean(event.files && event.files[0])
}

/**
 * Whether a file is one we should send to the transcription API.
 *
 * Both halves are required. Without the audio check any attachment was
 * downloaded and posted to OpenAI's audio endpoint, so a PDF or a screenshot
 * of potentially confidential client content was uploaded for nothing, and a
 * screen recording, whose audio track Whisper transcribes happily, had its
 * soundtrack answered instead of the question its owner typed alongside it.
 * Without the URL check `new URL(undefined)` threw a `TypeError`: Slack
 * Connect and restricted files arrive as a stub carrying `file_access`, and
 * `hidden_by_limit` and external-mode files have no download URL either, all
 * of which surfaced to the user as a generic internal failure.
 *
 * @param {Object} [file] a Slack file from `event.files`
 * @returns {boolean}
 */
export function isTranscribableFile(file) {
  if (!file) {
    return false
  }

  const isAudio =
    (typeof file.mimetype === 'string' && file.mimetype.startsWith('audio/')) ||
    // What Slack marks its own voice notes with.
    file.subtype === 'slack_audio'

  return (
    isAudio &&
    typeof file.url_private_download === 'string' &&
    file.url_private_download.length > 0
  )
}

/**
 * Whether the event carries message attachments, which is where the content of
 * a message forwarded or shared into the DM arrives.
 *
 * Slack's `attachments` are not `files`: Share or Forward with no comment
 * typed sends an empty `text`, no `files`, and the shared message in
 * `attachments`.
 *
 * @param {Object} event a Slack `message` event
 * @returns {boolean}
 */
export function hasAttachments(event) {
  return Boolean(event.attachments && event.attachments.length > 0)
}

/**
 * Whether the event is one a person is waiting on a reply to: typed text, a
 * file, or a forwarded message.
 *
 * Not the same question as whether there is something answerable. A forwarded
 * message with no comment has no question in it, and the handler asks for one
 * rather than answering content the sender never framed as a question, but
 * dropping it here left the person staring at a DM the bot had not even
 * reacted to.
 *
 * @param {Object} event a Slack `message` event
 * @returns {boolean}
 */
export function carriesQuestion(event) {
  return (
    hasQuestionText(event) || hasFileAttachment(event) || hasAttachments(event)
  )
}
