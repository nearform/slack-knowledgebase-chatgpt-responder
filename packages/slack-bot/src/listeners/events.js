import { Configuration, OpenAIApi } from 'openai'
import { getAnswer } from '../services/ai.service.js'
import { transcribe } from '../utils/ai.utils.js'
import { openOAuthURL } from '../utils/netsuite.utils.js'
import { isValidToken } from '../utils/token.utils.js'
import { OPENAI_API_KEY } from '../config.js'

const openai = new OpenAIApi(
  new Configuration({
    apiKey: OPENAI_API_KEY
  })
)

export const registerEvents = app => {
  app.event('message', async ({ event, client }) => {
    const errorResponse =
      'It appears I have run into an issue looking up an answer for you. Please try again'

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
        // @ts-ignore
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

  app.event('app_home_opened', async ({ event, context, say }) => {
    try {
      const netsuiteToken = context.netsuiteToken

      // Display messaging when opening the app based on NetSuite token status
      if (isValidToken(netsuiteToken)) {
        await say(
          `Welcome back <@${event.user}>! You are currently authenticated with NetSuite.`
        )
      } else {
        // Display a button to prompt the user to connect
        await say({
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `Hey <@${event.user}>, please login to your NetSuite account to continue.`
              },
              accessory: {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Connect'
                },
                action_id: 'netsuite_connect_btn'
              }
            }
          ],
          text: `Hey <@${event.user}>, please connect your NetSuite account to continue.`
        })
      }
    } catch (error) {
      console.error(error)
    }
  })

  app.action('netsuite_connect_btn', async ({ body, ack, respond }) => {
    // Acknowledge the action
    await ack()

    // Verify the user.id exists on the body
    if (body.user.id) {
      openOAuthURL(body.user.id)
      await respond(`Redirecting to NetSuite OAuth`)
    } else {
      await respond(`Could not determine your user_id`)
    }
  })
}
