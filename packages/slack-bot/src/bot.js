// https://github.com/seratch/slack-app-examples/blob/86bd224476814a42c41c133f9009ea66c0717517/serverless-bolt-template/gcp-js/app.js
import dotenv from 'dotenv'
import bolt from '@slack/bolt'
import { getAnswer } from './getAnswer.js'

const { App, ExpressReceiver } = bolt
dotenv.config()

const expressReceiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET
})

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: expressReceiver
})

const expressApp = expressReceiver.app

app.event('message', async ({ event, client }) => {
  try {
    const answer = await getAnswer(event.text)
    await client.chat.postMessage({
      channel: event.channel,
      text: answer
    })
  } catch (error) {
    console.error(error)
  }
})

// Check the details of the error to handle cases where you should retry sending a message or stop the app
app.error(error => {
  console.error(error)
})

function processEvent(req, res) {
  expressApp(req, res)
}

export { processEvent }
