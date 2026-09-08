// https://github.com/seratch/slack-app-examples/blob/86bd224476814a42c41c133f9009ea66c0717517/serverless-bolt-template/gcp-js/app.js
import bolt from '@slack/bolt'
import OpenAI from 'openai'
import { getAnswer, initialize } from './getAnswer.js'
import { transcribe } from './utils.js'
import {
  carriesQuestion,
  hasFileAttachment,
  hasQuestionText,
  isPlainUserMessage
} from './messageEvents.js'
import summarize from './summarize.js'

const { App, ExpressReceiver } = bolt

const expressReceiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET
})

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: expressReceiver
  // this is useful for debugging
  // signingSecret: process.env.SLACK_SIGNING_SECRET,
  // appToken: process.env.SLACK_APP_TOKEN,
  // socketMode: true
})

// Outside Bolt's /slack/events mount, so no Slack signature check applies. A
// Cloud Run startup probe on this path keeps full CPU allocated while the
// embeddings load, instead of the load being throttled in the background.
expressReceiver.app.get('/healthz', async (_req, res) => {
  try {
    await initialize()
    res.status(200).send('ok')
  } catch (error) {
    console.error('healthz: embeddings are not loaded', error)
    res.status(503).send('embeddings are not loaded')
  }
})

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const errorResponse =
  'It appears I have run into an issue looking up an answer for you. Please try again'

// Nothing went wrong on our side, so the generic failure above would be
// misleading as well as unhelpful.
const unintelligibleAudioResponse =
  'I could not make out any words in that recording. Please try again, or type your question instead'

app.event('message', async ({ event, client }) => {
  console.log('message event', event)

  // Both guards sit ahead of the reaction and the acknowledgement below, so an
  // event we should not answer produces no visible trace at all.
  //
  // A link unfurl on the bot's own answer comes back as a message event, and
  // answering it posts a question nobody asked, reacts to the bot's own
  // message, and can unfurl again in turn.
  if (!isPlainUserMessage(event)) {
    return
  }

  // Nothing to answer, and nothing a person is waiting on either: an event we
  // should not have been sent rather than a user visible situation.
  if (!carriesQuestion(event)) {
    return
  }

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

    if (hasFileAttachment(event)) {
      try {
        const transcribedResponse = await transcribe(event.files[0], openai)
        if (transcribedResponse) {
          questionInput = transcribedResponse
          client.chat.postMessage({
            channel: event.channel,
            text: `Give me a moment whilst I check for you. You asked: "${transcribedResponse.trim()}"`,
            thread_ts: event.ts
          })
        } else if (!hasQuestionText(event)) {
          // The audio yielded no words and there is nothing typed to fall back
          // on, so there is no question to look up. Say so, rather than asking
          // getAnswer for an answer to nothing and reporting its failure as
          // ours.
          await client.chat.postMessage({
            channel: event.channel,
            text: unintelligibleAudioResponse,
            thread_ts: event.ts
          })
          return
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

      await client.chat.postMessage({ channel: event.channel, text: answer })
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

summarize(app, openai)

// Check the details of the error to handle cases where you should retry sending a message or stop the app
app.error(error => {
  console.error(error)
})

export default app
export const expressApp = expressReceiver.app
