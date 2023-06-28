import {
  NETSUITE_SECRET,
  NETSUITE_TOKEN_ENDPOINT,
  NETSUITE_ACCOUNT_ID,
  NETSUITE_CLIENT_ID,
  NETSUITE_REDIRECT_URI
} from '../config.js'
import crypto from 'crypto'
import open from 'open'
import { setToken } from '../services/token.service.js'
import { createExpiryTimestamp } from './token.utils.js'

/**
 * NetSuite Access Token
 * @typedef {Object} AccessToken
 * @property {string} access_token - Returned from NetSuite
 * @property {string} refresh_token - Returned from NetSuite
 * @property {string} token_type - Returned from NetSuite
 * @property {number} expires_in - Expires at in seconds (3600), returned from NetSuite
 * @property {import('firebase/firestore').Timestamp | undefined} expires_at - Firebase Timestamp for token expiry
 * @property {string | undefined} employee_id - NetSuite Employee ID
 */

const authHeader = `Basic ${Buffer.from(
  `${NETSUITE_CLIENT_ID}:${NETSUITE_SECRET}`
).toString('base64')}`

/**
 * Create NetSuite Auth Endpoint with required params
 * @param {string} state
 * @returns {string}
 */
const getAuthEndpoint = state => {
  const params = {
    scope: 'rest_webservices',
    response_type: 'code',
    client_id: NETSUITE_CLIENT_ID,
    state,
    redirect_uri: NETSUITE_REDIRECT_URI
  }

  const queryString = Object.keys(params)
    .map(key => `${key}=${params[key]}`)
    .join('&')

  return `https://${NETSUITE_ACCOUNT_ID}.app.netsuite.com/app/login/oauth2/authorize.nl?${queryString}`
}

/**
 * Get the users access token and store it in Firebase
 * @param {string} userId
 * @param {string} authCode
 * @param {string} employeeId
 * @returns {Promise<AccessToken | null>}
 */
export const getAccessToken = async (userId, authCode, employeeId) => {
  try {
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: authHeader
      },
      body: new URLSearchParams({
        code: authCode,
        grant_type: 'authorization_code',
        redirect_uri: NETSUITE_REDIRECT_URI ?? ''
      })
    }

    const response = await fetch(NETSUITE_TOKEN_ENDPOINT, options)

    const token = await response?.json()

    //Decode token and get employee ID
    token.employee_id = employeeId

    // Firebase stores dates as Timestamps
    token.expires_at = createExpiryTimestamp(token.expires_in)

    // Store access token in Firestore with the user_id as the key
    await setToken(userId, token)

    return token
  } catch (error) {
    console.error('Failed to get access token', error)
    return null
  }
}

/**
 * Refresh the users acccess token and store it in Firebase
 * @param {string} userId
 * @param {string} refreshToken
 * @returns  {Promise<AccessToken | null>}
 */
export const refreshToken = async (userId, refreshToken) => {
  try {
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: authHeader
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    }

    const response = await fetch(NETSUITE_TOKEN_ENDPOINT, options)

    const newToken = await response?.json()

    // Firebase stores dates as Timestamps
    newToken.expires_at = createExpiryTimestamp(newToken.expires_in)

    // Store refreshed token in Firestore with the user_id as the key
    await setToken(userId, newToken)

    return newToken
  } catch (error) {
    console.error('Failed to refresh token', error)
    return null
  }
}

// TODO: Refactor, pulled from POC repo
/**
 * Querys NetSuite API
 * @param {*} param0
 * @returns {Promise<any>}
 */
export const query = async ({ q, authToken }) => {
  if (!q) throw new Error('Please provide a query')
  if (!authToken)
    throw new Error(
      'Please connect to NetSuite and provide the auth token to query'
    )

  const url = `https://${NETSUITE_ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`

  const reqOptions = {
    method: 'POST',
    headers: {
      Prefer: 'transient',
      Authorization: `Bearer ${authToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ q })
  }

  const response = await fetch(url, reqOptions)
  const data = await response.json()

  if (response.ok) {
    return data
  } else {
    throw new Error(JSON.stringify(data))
  }
}

/**
 * Open OAuth endpoint in a new browser tab
 * @param {string} userID
 */
export const openOAuthURL = userID => {
  // Create a nonce and pass it with user_id as state to NetSuite
  const stateParams = {
    nonce: crypto.randomBytes(16).toString('base64'),
    user_id: userID
  }
  const state = Buffer.from(JSON.stringify(stateParams)).toString('base64')

  // Open OAuth endpoint in a new browser tab
  open(getAuthEndpoint(state))
}
