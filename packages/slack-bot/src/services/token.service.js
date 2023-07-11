import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Initialize Firebase App
const firebaseApp = initializeApp()

// Create a Firestore for storing tokens
const fireStore = getFirestore(firebaseApp)

/**
 * Gets the access token from firestore by userId
 * @param {string} userId
 * @returns {Promise}
 */
export const getToken = async userId => {
  const result = await fireStore.doc(`tokens/${userId}`).get()

  if (result.exists) {
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
  return await fireStore.doc(`tokens/${userId}`).set(token, { merge: true })
}
