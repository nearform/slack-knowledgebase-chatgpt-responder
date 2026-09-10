import 'dotenv/config'
import { validateEnv } from './env.js'

validateEnv()

// Dynamic for the same reason as in index.js: bot.js constructs its clients as
// it loads, so it must not be imported until the environment has been checked.
const { default: app } = await import('./bot.js')

await app.start(process.env.PORT || 3000)
console.log(`⚡️ Slack Bolt app is running!`)
