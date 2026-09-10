import { describe, test } from 'node:test'

import {
  requiredEnvironmentVariables,
  pubSubEnvironmentVariables,
  validateEnv
} from '../src/env.js'

const completeProductionEnvironment = {
  SLACK_SIGNING_SECRET: 'slack-signing-secret-value',
  SLACK_BOT_TOKEN: 'slack-bot-token-value',
  OPENAI_API_KEY: 'openai-api-key-value',
  GCP_STORAGE_BUCKET_NAME: 'bucket-name',
  GCP_STORAGE_EMBEDDING_FILE_NAME: 'embeddings.csv',
  GCP_PROJECT_ID: 'project-id',
  GCP_EMBEDDING_SUBSCRIPTION: 'embedding-subscription'
}

describe('slack-bot validateEnv', () => {
  test('returns without throwing when every required variable is present', t => {
    t.assert.doesNotThrow(() =>
      validateEnv({ ...completeProductionEnvironment })
    )
  })

  test('requires exactly the variables the bot deployment always sets', t => {
    t.assert.deepStrictEqual(requiredEnvironmentVariables, [
      'SLACK_SIGNING_SECRET',
      'SLACK_BOT_TOKEN',
      'OPENAI_API_KEY',
      'GCP_STORAGE_BUCKET_NAME',
      'GCP_STORAGE_EMBEDDING_FILE_NAME'
    ])
  })

  test('treats the two Pub/Sub variables as the environment-dependent pair', t => {
    t.assert.deepStrictEqual(pubSubEnvironmentVariables, [
      'GCP_PROJECT_ID',
      'GCP_EMBEDDING_SUBSCRIPTION'
    ])
  })

  test('does not require MAX_CONTEXT_TOKENS, which has a default', t => {
    t.assert.strictEqual(
      requiredEnvironmentVariables
        .concat(pubSubEnvironmentVariables)
        .includes('MAX_CONTEXT_TOKENS'),
      false
    )
  })

  test('names every missing variable in one error, not only the first', t => {
    const environmentMissingTwoVariables = { ...completeProductionEnvironment }
    delete environmentMissingTwoVariables.SLACK_SIGNING_SECRET
    delete environmentMissingTwoVariables.GCP_STORAGE_EMBEDDING_FILE_NAME

    t.assert.throws(
      () => validateEnv(environmentMissingTwoVariables),
      error => {
        t.assert.match(error.message, /SLACK_SIGNING_SECRET/)
        t.assert.match(error.message, /GCP_STORAGE_EMBEDDING_FILE_NAME/)
        return true
      }
    )
  })

  test('counts an empty string and a whitespace-only value as missing', t => {
    t.assert.throws(
      () =>
        validateEnv({
          ...completeProductionEnvironment,
          SLACK_BOT_TOKEN: '',
          OPENAI_API_KEY: '   '
        }),
      error => {
        t.assert.match(error.message, /SLACK_BOT_TOKEN/)
        t.assert.match(error.message, /OPENAI_API_KEY/)
        return true
      }
    )
  })

  test('does not put the value of a present variable in the message', t => {
    const recognisableSecretValue = 'secret-signing-secret-never-printed'
    const environmentMissingBotToken = {
      ...completeProductionEnvironment,
      SLACK_SIGNING_SECRET: recognisableSecretValue
    }
    delete environmentMissingBotToken.SLACK_BOT_TOKEN

    t.assert.throws(
      () => validateEnv(environmentMissingBotToken),
      error => {
        t.assert.doesNotMatch(
          error.message,
          new RegExp(recognisableSecretValue)
        )
        t.assert.match(error.message, /SLACK_BOT_TOKEN/)
        return true
      }
    )
  })

  test('requires the Pub/Sub variables when IS_LOCAL_ENVIRONMENT is unset', t => {
    const environmentWithoutPubSubVariables = {
      ...completeProductionEnvironment
    }
    delete environmentWithoutPubSubVariables.GCP_PROJECT_ID
    delete environmentWithoutPubSubVariables.GCP_EMBEDDING_SUBSCRIPTION

    t.assert.throws(
      () => validateEnv(environmentWithoutPubSubVariables),
      error => {
        t.assert.match(error.message, /GCP_PROJECT_ID/)
        t.assert.match(error.message, /GCP_EMBEDDING_SUBSCRIPTION/)
        return true
      }
    )
  })

  test('does not require the Pub/Sub variables when IS_LOCAL_ENVIRONMENT is set', t => {
    const localEnvironmentWithoutPubSubVariables = {
      ...completeProductionEnvironment,
      IS_LOCAL_ENVIRONMENT: 'true'
    }
    delete localEnvironmentWithoutPubSubVariables.GCP_PROJECT_ID
    delete localEnvironmentWithoutPubSubVariables.GCP_EMBEDDING_SUBSCRIPTION

    t.assert.doesNotThrow(() =>
      validateEnv(localEnvironmentWithoutPubSubVariables)
    )
  })

  test('still requires the Pub/Sub variables when IS_LOCAL_ENVIRONMENT is empty', t => {
    const environmentWithEmptyLocalFlag = {
      ...completeProductionEnvironment,
      IS_LOCAL_ENVIRONMENT: ''
    }
    delete environmentWithEmptyLocalFlag.GCP_PROJECT_ID

    t.assert.throws(
      () => validateEnv(environmentWithEmptyLocalFlag),
      /GCP_PROJECT_ID/
    )
  })
})
