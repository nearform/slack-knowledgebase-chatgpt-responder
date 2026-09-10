import { describe, test } from 'node:test'

import { requiredEnvironmentVariables, validateEnv } from '../src/env.js'

const completeEnvironment = {
  OPENAI_API_KEY: 'openai-api-key-value',
  GCP_STORAGE_SCRAPED_FILE_NAME: 'scraped.csv',
  GCP_STORAGE_EMBEDDING_FILE_NAME: 'embeddings.csv'
}

describe('embeddings-creation validateEnv', () => {
  test('returns without throwing when every required variable is present', t => {
    t.assert.doesNotThrow(() => validateEnv({ ...completeEnvironment }))
  })

  test('requires exactly the variables the function deployment sets', t => {
    t.assert.deepStrictEqual(requiredEnvironmentVariables, [
      'OPENAI_API_KEY',
      'GCP_STORAGE_SCRAPED_FILE_NAME',
      'GCP_STORAGE_EMBEDDING_FILE_NAME'
    ])
  })

  test('does not require a bucket name, which arrives on the CloudEvent', t => {
    t.assert.strictEqual(
      requiredEnvironmentVariables.includes('GCP_STORAGE_BUCKET_NAME'),
      false
    )
    t.assert.doesNotThrow(() => validateEnv({ ...completeEnvironment }))
  })

  test('names every missing variable in one error, not only the first', t => {
    const environmentMissingTwoVariables = { ...completeEnvironment }
    delete environmentMissingTwoVariables.OPENAI_API_KEY
    delete environmentMissingTwoVariables.GCP_STORAGE_EMBEDDING_FILE_NAME

    t.assert.throws(
      () => validateEnv(environmentMissingTwoVariables),
      error => {
        t.assert.match(error.message, /OPENAI_API_KEY/)
        t.assert.match(error.message, /GCP_STORAGE_EMBEDDING_FILE_NAME/)
        return true
      }
    )
  })

  test('counts an empty string and a whitespace-only value as missing', t => {
    t.assert.throws(
      () =>
        validateEnv({
          ...completeEnvironment,
          OPENAI_API_KEY: '',
          GCP_STORAGE_SCRAPED_FILE_NAME: '   '
        }),
      error => {
        t.assert.match(error.message, /OPENAI_API_KEY/)
        t.assert.match(error.message, /GCP_STORAGE_SCRAPED_FILE_NAME/)
        return true
      }
    )
  })

  test('does not put the value of a present variable in the message', t => {
    const recognisableSecretValue = 'secret-openai-key-never-printed'
    const environmentMissingScrapedFileName = {
      ...completeEnvironment,
      OPENAI_API_KEY: recognisableSecretValue
    }
    delete environmentMissingScrapedFileName.GCP_STORAGE_SCRAPED_FILE_NAME

    t.assert.throws(
      () => validateEnv(environmentMissingScrapedFileName),
      error => {
        t.assert.doesNotMatch(
          error.message,
          new RegExp(recognisableSecretValue)
        )
        t.assert.match(error.message, /GCP_STORAGE_SCRAPED_FILE_NAME/)
        return true
      }
    )
  })
})
