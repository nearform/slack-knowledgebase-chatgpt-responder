import 'dotenv/config'
import * as ff from '@google-cloud/functions-framework'
import { createEmbeddings } from './create-embeddings.js'

ff.cloudEvent('create_embeddings', createEmbeddings)
