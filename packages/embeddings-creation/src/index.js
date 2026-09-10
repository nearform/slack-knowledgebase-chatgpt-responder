import 'dotenv/config'
import * as ff from '@google-cloud/functions-framework'
import { validateEnv } from './env.js'

validateEnv()

// Dynamic so the OpenAI client create-embeddings.js builds as it loads is not
// constructed until the environment has been checked.
const { createEmbeddings } = await import('./create-embeddings.js')

ff.cloudEvent('create_embeddings', createEmbeddings)
