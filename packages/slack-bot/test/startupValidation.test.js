import { after, before, test, mock } from 'node:test'
import sinon from 'sinon'

// The point of this file is ordering, not the message: bot.js builds an
// ExpressReceiver, a Bolt App and an OpenAI client as it loads, so a
// validateEnv() call that sat after a static import of bot.js would run too
// late to stop them. index.js therefore validates first and imports bot.js
// dynamically, and the assertions below are that the import rejects and that
// none of those three constructors ran. dotenv/config is neutralised so a
// developer's local .env cannot decide the outcome, and mock.module registers a
// specifier once per process, so this lives in its own test file.

const expressReceiverConstructorSpy = sinon.spy()
const appConstructorSpy = sinon.spy()
const openAiConstructorSpy = sinon.spy()

class ExpressReceiverMock {
  app = { get: () => {} }
  constructor(...args) {
    expressReceiverConstructorSpy(...args)
  }
}

class AppMock {
  constructor(...args) {
    appConstructorSpy(...args)
  }
  event() {}
  shortcut() {}
  error() {}
}

class OpenAIMock {
  constructor(...args) {
    openAiConstructorSpy(...args)
  }
}

const environmentBeforeTest = { ...process.env }

const variablesClearedForTest = [
  'SLACK_SIGNING_SECRET',
  'SLACK_BOT_TOKEN',
  'OPENAI_API_KEY',
  'GCP_STORAGE_BUCKET_NAME',
  'GCP_STORAGE_EMBEDDING_FILE_NAME',
  'GCP_PROJECT_ID',
  'GCP_EMBEDDING_SUBSCRIPTION',
  'IS_LOCAL_ENVIRONMENT'
]

before(() => {
  mock.module('dotenv/config', {})
  mock.module('@slack/bolt', {
    namedExports: { App: AppMock, ExpressReceiver: ExpressReceiverMock }
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

test('loading the slack bot entry point without its environment rejects before any client is constructed', async t => {
  await t.assert.rejects(
    () => import('../src/index.js'),
    error => {
      t.assert.match(error.message, /SLACK_SIGNING_SECRET/)
      t.assert.match(error.message, /SLACK_BOT_TOKEN/)
      t.assert.match(error.message, /OPENAI_API_KEY/)
      t.assert.match(error.message, /GCP_STORAGE_BUCKET_NAME/)
      t.assert.match(error.message, /GCP_STORAGE_EMBEDDING_FILE_NAME/)
      t.assert.match(error.message, /GCP_PROJECT_ID/)
      t.assert.match(error.message, /GCP_EMBEDDING_SUBSCRIPTION/)
      return true
    }
  )

  sinon.assert.notCalled(expressReceiverConstructorSpy)
  sinon.assert.notCalled(appConstructorSpy)
  sinon.assert.notCalled(openAiConstructorSpy)
})
