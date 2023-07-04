import { doc, getDoc, setDoc } from 'firebase/firestore'
import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import {
  FIREBASE_API_KEY,
  FIREBASE_APP_ID,
  FIREBASE_AUTH_DOMAIN,
  FIREBASE_MESSAGING_ID,
  FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET,
  FIREBASE_MEASUREMENT_ID
} from '../config.js'

// Initialize Firebase App
const firebaseApp = initializeApp({
  apiKey: FIREBASE_API_KEY,
  projectId: FIREBASE_PROJECT_ID,
  authDomain: FIREBASE_AUTH_DOMAIN,
  storageBucket: FIREBASE_STORAGE_BUCKET,
  messagingSenderId: FIREBASE_MESSAGING_ID,
  appId: FIREBASE_APP_ID,
  measurementId: FIREBASE_MEASUREMENT_ID
})

// Create a Firestore for storing tokens
const fireStore = getFirestore(firebaseApp)

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
