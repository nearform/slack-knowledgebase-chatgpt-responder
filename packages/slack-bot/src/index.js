import bolt from '@slack/bolt'
import { getFirestore } from 'firebase/firestore'
import {
  SLACK_BOT_TOKEN,
  SLACK_SIGNING_SECRET,
  FIREBASE_API_KEY,
  FIREBASE_APP_ID,
  FIREBASE_AUTH_DOMAIN,
  FIREBASE_MESSAGING_ID,
  FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET,
  FIREBASE_MEASUREMENT_ID
} from './config.js'
import { registerListeners } from './listeners/index.js'
import { authMiddleware } from './middleware/auth.js'
import { initializeApp } from 'firebase/app'

const { App, ExpressReceiver } = bolt

// Initialize Firebase App
const firebaseApp = initializeApp({
  apiKey: FIREBASE_API_KEY,
  projectId: FIREBASE_PROJECT_ID,
  authDomain: FIREBASE_AUTH_DOMAIN,
  storageBucket: FIREBASE_STORAGE_BUCKET,
  messagingSenderId: FIREBASE_MESSAGING_ID,
  appId: FIREBASE_APP_ID,
  measurementId: FIREBASE_MEASUREMENT_ID
})

// Create a Firestore for storing tokens
export const fireStore = getFirestore(firebaseApp)

// Create express receiver for routes
const expressReceiver = new ExpressReceiver({
  signingSecret: SLACK_SIGNING_SECRET
})

// Initialize Slack App
const slackApp = new App({
  token: SLACK_BOT_TOKEN,
  receiver: expressReceiver
})

// Check the details of the error to handle cases where you should retry sending a message or stop the app
slackApp.error(async error => {
  console.error(error)
})

// Register Listeners
registerListeners(slackApp, expressReceiver)

// Register Middleware
slackApp.use(authMiddleware)

function slackBot(req, res) {
  expressReceiver.app(req, res)
}

export { slackBot }
