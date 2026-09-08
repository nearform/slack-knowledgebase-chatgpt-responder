/**
 * Decisions about which Slack `message` events the bot should answer, kept
 * apart from the handler so they can be tested without constructing a Bolt app.
 */

/**
 * Whether a `message` event is a plain message a person sent.
 *
 * Slack delivers far more than typed messages on this event. Edits, deletions,
 * joins and channel changes arrive as subtypes, and a link unfurl on the bot's
 * own answer arrives as a `message_changed` subtype carrying the bot's
 * `bot_id` and `hidden: true`. Only a plain user message keeps its text at
 * `event.text`, so treating any of the others as a question asks the model
 * something nobody asked.
 *
 * @param {Object} [event] a Slack `message` event
 * @returns {boolean}
 */
export function isPlainUserMessage(event) {
  return Boolean(event) && !event.subtype && !event.bot_id && !event.hidden
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
