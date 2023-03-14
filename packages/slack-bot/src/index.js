import * as dotenv from 'dotenv'
import bolt from '@slack/bolt'
import fetch from 'node-fetch'
import querystring from 'node:querystring'

const { App } = bolt
dotenv.config()

// Initializes your app with your bot token and signing secret
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  port: process.env.PORT || 3333
})

// Listens to incoming messages that contain "hello"
app.message('hello', async ({ message, say }) => {
  const payload = {
    question: message.message
  }

  const response = await fetch(
    `${process.env.GET_ANSWER_API}?${querystring.encode(payload)}`
  )
  const data = await response.json()

  // say() sends a message to the channel where the event was triggered
  // @NOTE expected payload temporarily hardcoded as https://zenquotes.io/api/random response :)
  await say(`Hey there <@${message.user}>!\nThe answer is: ${data[0].q}`)
})
;(async () => {
  // Start your app
  await app.start()

  console.log('⚡️ Bolt app is running!')
})()
