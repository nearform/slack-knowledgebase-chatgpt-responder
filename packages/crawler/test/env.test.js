import { describe, test } from 'node:test'

import { requiredEnvironmentVariables, validateEnv } from '../src/env.js'

const completeEnvironment = {
  NOTION_TOKEN: 'notion-token-value',
  GCP_STORAGE_BUCKET_NAME: 'bucket-name',
  GCP_STORAGE_SCRAPED_FILE_NAME: 'scraped.csv'
}

describe('crawler validateEnv', () => {
  test('returns without throwing when every required variable is present', t => {
    t.assert.doesNotThrow(() => validateEnv({ ...completeEnvironment }))
  })

  test('requires exactly the variables the crawler deployment sets', t => {
    t.assert.deepStrictEqual(requiredEnvironmentVariables, [
      'NOTION_TOKEN',
      'GCP_STORAGE_BUCKET_NAME',
      'GCP_STORAGE_SCRAPED_FILE_NAME'
    ])
  })

  test('names every missing variable in one error, not only the first', t => {
    const environmentMissingTwoVariables = { ...completeEnvironment }
    delete environmentMissingTwoVariables.NOTION_TOKEN
    delete environmentMissingTwoVariables.GCP_STORAGE_SCRAPED_FILE_NAME

    t.assert.throws(
      () => validateEnv(environmentMissingTwoVariables),
      error => {
        t.assert.match(error.message, /NOTION_TOKEN/)
        t.assert.match(error.message, /GCP_STORAGE_SCRAPED_FILE_NAME/)
        return true
      }
    )
  })

  test('counts an empty string and a whitespace-only value as missing', t => {
    t.assert.throws(
      () =>
        validateEnv({
          ...completeEnvironment,
          NOTION_TOKEN: '',
          GCP_STORAGE_BUCKET_NAME: '   '
        }),
      error => {
        t.assert.match(error.message, /NOTION_TOKEN/)
        t.assert.match(error.message, /GCP_STORAGE_BUCKET_NAME/)
        return true
      }
    )
  })

  test('does not put the value of a present variable in the message', t => {
    const recognisableSecretValue = 'secret-notion-token-never-printed'
    const environmentMissingBucketName = {
      ...completeEnvironment,
      NOTION_TOKEN: recognisableSecretValue
    }
    delete environmentMissingBucketName.GCP_STORAGE_BUCKET_NAME

    t.assert.throws(
      () => validateEnv(environmentMissingBucketName),
      error => {
        t.assert.doesNotMatch(
          error.message,
          new RegExp(recognisableSecretValue)
        )
        t.assert.match(error.message, /GCP_STORAGE_BUCKET_NAME/)
        return true
      }
    )
  })
})
