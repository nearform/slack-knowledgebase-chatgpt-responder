// https://github.com/seratch/slack-app-examples/blob/86bd224476814a42c41c133f9009ea66c0717517/serverless-bolt-template/gcp-js/app.js
import bolt from '@slack/bolt'
import OpenAI from 'openai'
import { getAnswer, initialize } from './getAnswer.js'
import { transcribe } from './utils.js'
import {
  carriesQuestion,
  hasQuestionText,
  isPlainUserMessage,
  isTranscribableFile
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

// Also not our failure: a document, an image, a video, or a file Slack will
// not let us download. Telling someone to try again, as the generic failure
// does, sends them round a loop that cannot help.
const unreadableAttachmentResponse =
  'I could not read that attachment. Please type your question instead'

// A message forwarded or shared into the DM with no comment typed. There is
// content, but no question in it, and the person is waiting on a reply.
const noQuestionInShareResponse =
  'I can see what you shared, but not a question. Please type your question and I will look it up'

// The attachment was no use, but a question was typed alongside it, so there
// is something to answer. Short, because the answer is on its way.
const attachmentFallbackResponse =
  'I could not get anything from that attachment, so I will answer the question you typed.'

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
    // Set when the audio carried no words and nothing was typed alongside it.
    // Decided inside the guarded block below and acted on after it.
    let audioHadNoWords = false
    // Set when the attachment was no use but a question was typed alongside
    // it, so the answer can say the file was not read.
    let fellBackToTypedText = false

    // Deliberately not awaited, here and for the interim acknowledgements
    // below: none of them gates the answer, so the answer should not wait on
    // them and the latency stays as it was. What they do need is a catch. The
    // WebClient rejects with a WebAPIPlatformError on ok: false, and
    // already_reacted on a Slack redelivery, msg_too_long, or a 429 after
    // retries is nothing the handler's try/catch or app.error can see: an
    // unhandled rejection ends the process and every request in flight on it.
    client.reactions
      .add({
        channel: event.channel,
        name: 'thumbsup',
        timestamp: event.ts
      })
      .catch(console.error)

    try {
      const clientReq = await client.users.info({
        user: event.user,
        include_locale: true
      })
      user = clientReq.user
    } catch (error) {
      console.error('error', error)
    }

    const attachedFiles = event.files ?? []
    // The first file we can transcribe, not the first file: a document
    // uploaded alongside a voice note told the person their attachment could
    // not be read while the recording was silently ignored. The first file is
    // still what the unreadable-attachment reply below is about, since by then
    // there is nothing transcribable among them.
    const fileToTranscribe = attachedFiles.find(isTranscribableFile) ?? null
    const [attachedFile] = attachedFiles

    if (fileToTranscribe) {
      try {
        // transcribe trims what it returns, so the empty string is exactly
        // "no words were heard" and is what this branches on. Whisper's text
        // format gives only whitespace for audio with no speech in it, and a
        // whitespace-only string is truthy, which is why the normalisation
        // matters and why it lives in one place.
        const transcribedQuestion = await transcribe(fileToTranscribe, openai)
        if (transcribedQuestion) {
          questionInput = transcribedQuestion
          client.chat
            .postMessage({
              channel: event.channel,
              text: `Give me a moment whilst I check for you. You asked: "${transcribedQuestion}"`,
              thread_ts: event.ts
            })
            .catch(console.error)
        } else if (!hasQuestionText(event)) {
          // The audio yielded no words and there is nothing typed to fall back
          // on, so there is no question to look up. Only the decision is made
          // here: saying so is done outside this block, because a Slack
          // failure posting it is not a transcription failure and must not be
          // answered with the generic error the catch below would reach for.
          audioHadNoWords = true
        } else {
          // No words, but a question was typed alongside the recording, so
          // that is what gets answered.
          fellBackToTypedText = true
        }
      } catch (err) {
        console.error('transcription error', err)
        // The file failed, not the question, so fall back to anything typed
        // alongside rather than losing an answerable question. With nothing
        // typed there is no fallback, and the generic failure below stands.
        processingError = !hasQuestionText(event)
        fellBackToTypedText = !processingError
      }

      if (audioHadNoWords) {
        // Nothing went wrong on our side, so this is the whole reply and the
        // catch is here rather than around it: if Slack will not take the
        // notice, there is nothing better to tell the user instead.
        await client.chat
          .postMessage({
            channel: event.channel,
            text: unintelligibleAudioResponse,
            thread_ts: event.ts
          })
          .catch(console.error)
        return
      }
    } else if (attachedFile) {
      // A file we will not transcribe: a document, an image, a video, or one
      // Slack served us no download URL for. Nothing is sent to OpenAI.
      if (hasQuestionText(event)) {
        fellBackToTypedText = true
      } else {
        // Nothing typed and nothing we can read, so there is no question to
        // look up. This is the user's situation to fix, not an internal
        // failure, and the generic error told them to try again when retrying
        // cannot help.
        await client.chat
          .postMessage({
            channel: event.channel,
            text: unreadableAttachmentResponse,
            thread_ts: event.ts
          })
          .catch(console.error)
        return
      }
    } else if (!hasQuestionText(event)) {
      // Nothing typed, no file: a message forwarded or shared into the DM with
      // no comment, whose content sits in event.attachments. Deliberately not
      // answered as though it were the question, because the sender never
      // framed it as one, but they are waiting on a reply, so ask for one.
      await client.chat
        .postMessage({
          channel: event.channel,
          text: noQuestionInShareResponse,
          thread_ts: event.ts
        })
        .catch(console.error)
      return
    } else {
      client.chat
        .postMessage({
          channel: event.channel,
          text: `Thanks for your question. Let me check available information on that for you.`
        })
        .catch(console.error)
    }

    if (fellBackToTypedText) {
      // The attachment was no use, so say so and answer what was typed. Left
      // unsaid, the person waited the whole embeddings and completion round
      // trip on a bare thumbsup and was never told the file was ignored.
      client.chat
        .postMessage({
          channel: event.channel,
          text: attachmentFallbackResponse,
          thread_ts: event.ts
        })
        .catch(console.error)
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
