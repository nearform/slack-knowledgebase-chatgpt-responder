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
 * Whether the event carries a file, which transcription may turn into a
 * question.
 *
 * @param {Object} event a Slack `message` event
 * @returns {boolean}
 */
export function hasFileAttachment(event) {
  return Boolean(event.files && event.files[0])
}

/**
 * Whether there is anything to answer: typed text, or a file to transcribe.
 *
 * @param {Object} event a Slack `message` event
 * @returns {boolean}
 */
export function carriesQuestion(event) {
  return hasQuestionText(event) || hasFileAttachment(event)
}
