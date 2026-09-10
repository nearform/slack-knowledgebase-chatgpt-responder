import { after, before, test, mock } from 'node:test'
import sinon from 'sinon'

// The point of this file is ordering, not the message: create-embeddings.js
// builds an OpenAI client and captures both GCP_STORAGE_* file names as it
// loads, so a validateEnv() call that sat after a static import of it would run
// too late to stop any of that. index.js therefore validates first and imports
// create-embeddings.js dynamically, and the assertions below are that the
// import rejects and that the OpenAI constructor never ran. The functions
// framework is mocked because index.js imports it statically, so it evaluates
// before validation and must register nothing real. dotenv/config is
// neutralised so a developer's local .env cannot decide the outcome, and this
// package's test script sets the two GCP_STORAGE_* names via cross-env, so they
// are cleared explicitly below. mock.module registers a specifier once per
// process, so this lives in its own test file.

const openAiConstructorSpy = sinon.spy()
const cloudEventSpy = sinon.spy()

class OpenAIMock {
  constructor(...args) {
    openAiConstructorSpy(...args)
  }
}

const environmentBeforeTest = { ...process.env }

const variablesClearedForTest = [
  'OPENAI_API_KEY',
  'GCP_STORAGE_SCRAPED_FILE_NAME',
  'GCP_STORAGE_EMBEDDING_FILE_NAME'
]

before(() => {
  mock.module('dotenv/config', {})
  mock.module('@google-cloud/functions-framework', {
    namedExports: { cloudEvent: cloudEventSpy }
  })
  mock.module('openai', {
    defaultExport: OpenAIMock,
    namedExports: { OpenAI: OpenAIMock }
  })

  for (const variableName of variablesClearedForTest) {
    delete process.env[variableName]
  }
})

after(() => {
  process.env = { ...environmentBeforeTest }
  mock.reset()
  sinon.restore()
})

test('loading the embeddings entry point without its environment rejects before the OpenAI client is constructed', async t => {
  await t.assert.rejects(
    () => import('../src/index.js'),
    error => {
      t.assert.match(error.message, /OPENAI_API_KEY/)
      t.assert.match(error.message, /GCP_STORAGE_SCRAPED_FILE_NAME/)
      t.assert.match(error.message, /GCP_STORAGE_EMBEDDING_FILE_NAME/)
      return true
    }
  )

  sinon.assert.notCalled(openAiConstructorSpy)
  sinon.assert.notCalled(cloudEventSpy)
})
