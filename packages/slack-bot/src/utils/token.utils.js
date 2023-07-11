import { Timestamp } from 'firebase-admin/firestore'
import moment from 'moment'

/**
 * Create a Firebase Timestamp expiry for tokens
 * @param {string | number} expiresInSeconds
 * @returns {Timestamp}
 */
export const createExpiryTimestamp = expiresInSeconds => {
  // Create expiry date - NetSuite token expiry is always set to 3600 seconds
  const expiryDate = moment().add(expiresInSeconds, 'seconds').toDate()

  return Timestamp.fromDate(expiryDate)
}

/**
 * Checks if the access token has expired
 * @param {import('./netsuite.utils').AccessToken} netsuiteToken
 * @returns {boolean | ""}
 */
export const isValidToken = netsuiteToken => {
  return (
    netsuiteToken?.access_token &&
    moment().isBefore(netsuiteToken?.expires_at?.toDate())
  )
}
