import { doc, getDoc, setDoc } from 'firebase/firestore'
import { fireStore } from '../index.js'

/**
 * Gets the access token from firestore by userId
 * @param {string} userId
 * @returns {Promise}
 */
export const getToken = async userId => {
  const result = await getDoc(doc(fireStore, 'tokens', userId))

  if (result.exists()) {
    return result.data()
  }

  return null
}

/**
 * Saves the access token to firestore under the userId
 * @param {string} userId
 * @param {import('../utils/netsuite.utils.js').AccessToken} token
 * @returns {Promise}
 */
export const setToken = async (userId, token) => {
  return await setDoc(doc(fireStore, 'tokens', userId), token, { merge: true })
}
