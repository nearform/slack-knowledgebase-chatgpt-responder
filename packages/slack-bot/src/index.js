import bolt from '@slack/bolt'
import { SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET } from './config.js'
import { registerListeners } from './listeners/index.js'
import { authMiddleware } from './middleware/auth.js'

const { App, ExpressReceiver } = bolt

// Create express receiver for routes
const expressReceiver = new ExpressReceiver({
  signingSecret: SLACK_SIGNING_SECRET
})

// Initialize Slack App
const slackApp = new App({
  token: SLACK_BOT_TOKEN,
  receiver: expressReceiver
})

// Check the details of the error to handle cases where you should retry sending a message or stop the app
slackApp.error(async error => {
  console.error(error)
})

// Register Listeners
registerListeners(slackApp, expressReceiver)

// Register Middleware
slackApp.use(authMiddleware)

function slackBot(req, res) {
  expressReceiver.app(req, res)
}

export { slackBot }
