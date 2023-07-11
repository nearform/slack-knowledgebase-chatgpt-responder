import * as dotenv from 'dotenv'

dotenv.config({
  path: `.env`
})

/* MISC */
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-ada-002'
export const LOCAL_EMBEDDINGS_FILE = './embeddings.csv'
export const IS_LOCAL_ENVIRONMENT = Boolean(process.env.IS_LOCAL_ENVIRONMENT)

/* SLACK */
export const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || ''
export const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || ''
export const SLACK_APP_URL = process.env.SLACK_APP_URL || ''

/* NETSUITE */
export const NETSUITE_CLIENT_ID = process.env.NETSUITE_CLIENT_ID || ''
export const NETSUITE_REDIRECT_URI = process.env.NETSUITE_REDIRECT_URI || ''
export const NETSUITE_ACCOUNT_ID = process.env.NETSUITE_ACCOUNT_ID || ''
export const NETSUITE_SECRET = process.env.NETSUITE_SECRET || ''
export const NETSUITE_TOKEN_ENDPOINT = `https://${NETSUITE_ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token`
export const NESUITE_ALLOWED_ROLE_IDS = process.env.NESUITE_ALLOWED_ROLE_IDS
  ? process.env.NESUITE_ALLOWED_ROLE_IDS.split(',')
  : []

/* GCP */
export const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || ''
export const GCP_EMBEDDING_SUBSCRIPTION =
  process.env.GCP_EMBEDDING_SUBSCRIPTION || ''
export const GCP_STORAGE_BUCKET_NAME = process.env.GCP_STORAGE_BUCKET_NAME || ''
export const GCP_STORAGE_EMBEDDING_FILE_NAME =
  process.env.GCP_STORAGE_EMBEDDING_FILE_NAME || ''
export const GCP_SUB_NAME = `projects/${GCP_PROJECT_ID}/subscriptions/${GCP_EMBEDDING_SUBSCRIPTION}`

/* OPENAI */
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
