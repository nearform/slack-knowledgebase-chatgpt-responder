// https://github.com/seratch/slack-app-examples/blob/86bd224476814a42c41c133f9009ea66c0717517/serverless-bolt-template/gcp-js/app.js
import bolt from '@slack/bolt'
import OpenAI from 'openai'
import { getAnswer } from './getAnswer.js'
import { transcribe } from './utils.js'

const { App, ExpressReceiver } = bolt

const expressReceiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET
})

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: expressReceiver
})

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const errorResponse =
  'It appears I have run into an issue looking up an answer for you. Please try again'

app.event('message', async ({ event, client }) => {
  try {
    let user = null
    let answer = null
    let processingError = false
    let questionInput = event.text

    client.reactions.add({
      channel: event.channel,
      name: 'thumbsup',
      timestamp: event.ts
    })

    try {
      const clientReq = await client.users.info({
        user: event.user,
        include_locale: true
      })
      user = clientReq.user
    } catch (error) {
      console.error('error', error)
    }

    if (event.files && event.files[0]) {
      try {
        const transcribedResponse = await transcribe(event.files[0], openai)
        if (transcribedResponse) {
          questionInput = transcribedResponse
          client.chat.postMessage({
            channel: event.channel,
            text: `Give me a moment whilst I check for you. You asked: "${transcribedResponse.trim()}"`,
            thread_ts: event.ts
          })
        }
      } catch (err) {
        console.error('transcription error', err)
        processingError = true
      }
    } else {
      client.chat.postMessage({
        channel: event.channel,
        text: `Thanks for your question. Let me check available information on that for you.`
      })
    }

    if (!processingError) {
      answer = await getAnswer({
        question: questionInput,
        locale: user?.locale,
        openai
      })

      await client.chat.postMessage({
        channel: event.channel,
        text: answer
      })
    } else {
      await client.chat.postMessage({
        channel: event.channel,
        text: errorResponse
      })
    }
  } catch (error) {
    console.error('message event error', error)
    await client.chat.postMessage({
      channel: event.channel,
      text: errorResponse
    })
  }
})

const extractLinksFromMessage = message => {
  const links = []
  message.blocks.forEach(block => {
    if (block.type === 'rich_text') {
      block.elements.forEach(element => {
        if (element.type === 'rich_text_section') {
          element.elements.forEach(el => {
            if (el.type === 'link') {
              links.push(el.url)
            }
          })
        }
      })
    }
  })
  return links
}

app.shortcut('summarize', async ({ shortcut, ack, client }) => {
  await ack()

  const links = extractLinksFromMessage(shortcut.message)

  for (const link of links) {
    const response = await openai.responses.create({
      model: 'gpt-4o',
      tools: [{ type: 'web_search_preview' }],
      input: `Summarize the content of the following link: ${link}. If the page is not accessible, provide only a short error message.`
    })

    await client.chat.postMessage({
      channel: shortcut.channel.id,
      thread_ts: shortcut.message.ts,
      text: `Here is the summary of the <${link}|link> you requested: 

${response.output_text} `
    })
  }
})

// Check the details of the error to handle cases where you should retry sending a message or stop the app
app.error(error => {
  console.error(error)
})

export default app
export const expressApp = expressReceiver.app
