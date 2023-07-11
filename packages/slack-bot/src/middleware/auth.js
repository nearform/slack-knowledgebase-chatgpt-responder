import { getToken } from '../services/token.service.js'
import { isValidToken } from '../utils/token.utils.js'
import { refreshToken } from '../utils/netsuite.utils.js'

// Auth middleware to handle checking memory and updating context
export const authMiddleware = async ({ payload, context, next }) => {
  try {
    // Event payloads have user and command payloads have user_id
    const userID = payload.user ?? payload.user_id
    if (userID) {
      const token = await getToken(userID)

      //Update context for next event
      if (token && isValidToken(token)) {
        context.netsuiteToken = token
      } else {
        if (token?.refresh_token) {
          //Refresh the users token and update context
          const newToken = await refreshToken(userID, token.refresh_token)
          context.netsuiteToken = newToken
        } else {
          //No refresh token present, set context to null to prompt /login
          context.netsuiteToken = null
        }
      }
    }
  } catch (error) {
    console.error('Failed to getToken from firestore', error)
  }

  await next()
}
