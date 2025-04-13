import 'dotenv/config'
import app from './bot.js'

await app.start(process.env.PORT || 3000)
console.log(`⚡️ Slack Bolt app is running!`)
