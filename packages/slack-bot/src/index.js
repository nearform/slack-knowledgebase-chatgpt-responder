import { processEvent } from './bot.js'

function slackBot(req, res) {
  processEvent(req, res)
}

export { slackBot }
