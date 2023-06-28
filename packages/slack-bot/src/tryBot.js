import 'dotenv/config'
import { getAnswer } from './services/ai.service.js'
import { Configuration, OpenAIApi } from 'openai'
import { OPENAI_API_KEY } from './config.js'

const question = process.env.npm_config_question ?? ''

const openai = new OpenAIApi(
  new Configuration({
    apiKey: OPENAI_API_KEY
  })
)

getAnswer({ question, openai }).then(answer => {
  console.log(answer)
})
