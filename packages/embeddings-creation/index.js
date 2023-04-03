import * as ff from '@google-cloud/functions-framework'
import { createEmbeddings } from './src/createEmbeddings'


ff.cloudEvent('create_embeddings', createEmbeddings)
