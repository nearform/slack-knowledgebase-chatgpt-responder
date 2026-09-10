/**
 * Every environment variable the crawler cannot run without, as set by
 * `.github/workflows/deploy-step.yml`.
 */
export const requiredEnvironmentVariables = [
  'NOTION_TOKEN',
  'GCP_STORAGE_BUCKET_NAME',
  'GCP_STORAGE_SCRAPED_FILE_NAME'
]

const isMissing = value =>
  typeof value !== 'string' || value.trim().length === 0

/**
 * Fail fast when the crawler is misconfigured. Called from the entry point
 * before the Notion client is constructed, so a missing variable is named at
 * startup rather than costing a whole crawl or surfacing as a client-library
 * error. Every missing name is reported at once; no value is ever included in
 * the message, because these are secrets.
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
