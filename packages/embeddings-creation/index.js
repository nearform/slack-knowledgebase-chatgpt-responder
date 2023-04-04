import * as ff from '@google-cloud/functions-framework'
import { createEmbeddings } from './src/create-embeddings.js'

ff.cloudEvent('create_embeddings', createEmbeddings)
