import 'dotenv/config'
import { getAnswer } from './getAnswer.js'

const question = process.env.npm_config_question

getAnswer({ question }).then(answer => {
  console.log(answer)
})
