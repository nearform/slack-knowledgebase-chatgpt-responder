/**
 * Send a message to a Slack User
 * @param {import('@slack/web-api').WebClient} client
 * @param {string} userId
 * @param {string} text
 * @returns {Promise}
 */
export function sendMessageToUser(client, userId, text) {
  return client.chat.postMessage({ channel: userId, text })
}
