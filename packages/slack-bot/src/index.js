import 'dotenv/config'
import { validateEnv } from './env.js'

validateEnv()

// Imported dynamically, and only once the environment has been checked:
// bot.js builds its Bolt receiver, Bolt app and OpenAI client as it loads, and
// a static import would evaluate all of that before this file's own body ran.
const { expressApp } = await import('./bot.js')

export { expressApp as slackBot }
