/**
 * Every environment variable the embeddings function cannot run without, as
 * set by `.github/workflows/deploy-step.yml`. The bucket is deliberately not
 * here: it arrives on the CloudEvent rather than from the environment
 * (`src/create-embeddings.js`).
 */
export const requiredEnvironmentVariables = [
  'OPENAI_API_KEY',
  'GCP_STORAGE_SCRAPED_FILE_NAME',
  'GCP_STORAGE_EMBEDDING_FILE_NAME'
]

const isMissing = value =>
  typeof value !== 'string' || value.trim().length === 0

/**
 * Fail fast when the function is misconfigured. Called from the entry point
 * before the OpenAI client is constructed, so a missing variable is named at
 * startup rather than surfacing as a client-library error on the first event.
 * Every missing name is reported at once; no value is ever included in the
 * message, because these are secrets.
 *
 * @param {Record<string, string | undefined>} [env]
 * @throws {Error} if any required variable is absent, empty or whitespace-only
 */
export function validateEnv(env = process.env) {
  const missing = requiredEnvironmentVariables.filter(name =>
    isMissing(env[name])
  )

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    )
  }
}
