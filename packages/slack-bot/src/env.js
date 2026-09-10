/**
 * Every environment variable the bot cannot run without, in any environment,
 * as set by `.github/workflows/deploy-step.yml`. `MAX_CONTEXT_TOKENS` is not
 * here on purpose: it is optional and has a default, validated by
 * `parsePositiveTokenCount` in `getAnswer.js`.
 */
export const requiredEnvironmentVariables = [
  'SLACK_SIGNING_SECRET',
  'SLACK_BOT_TOKEN',
  'OPENAI_API_KEY',
  'GCP_STORAGE_BUCKET_NAME',
  'GCP_STORAGE_EMBEDDING_FILE_NAME'
]

/**
 * The pair used solely to build the Pub/Sub subscription name in
 * `getAnswer.js`, a path the local environment skips. They are required only
 * when `IS_LOCAL_ENVIRONMENT` is falsy.
 */
export const pubSubEnvironmentVariables = [
  'GCP_PROJECT_ID',
  'GCP_EMBEDDING_SUBSCRIPTION'
]

const isMissing = value =>
  typeof value !== 'string' || value.trim().length === 0

/**
 * Fail fast when the bot is misconfigured. Called from the entry point before
 * the Bolt receiver, the Bolt app and the OpenAI client are constructed, so a
 * missing variable is named at startup rather than surfacing as an opaque
 * client-library error on the first Slack request. Every missing name is
 * reported at once; no value is ever included in the message, because these
 * are secrets.
 *
 * `IS_LOCAL_ENVIRONMENT` is read off the same `env` with the same `Boolean`
 * semantics `utils.js` uses, so an empty value still means production.
 *
 * @param {Record<string, string | undefined>} [env]
 * @throws {Error} if any required variable is absent, empty or whitespace-only
 */
export function validateEnv(env = process.env) {
  const isLocalEnvironment = Boolean(env.IS_LOCAL_ENVIRONMENT)

  const namesToCheck = isLocalEnvironment
    ? requiredEnvironmentVariables
    : [...requiredEnvironmentVariables, ...pubSubEnvironmentVariables]

  const missing = namesToCheck.filter(name => isMissing(env[name]))

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    )
  }
}
