import { getAccessToken } from '../utils/netsuite.utils.js'
import { NESUITE_ALLOWED_ROLE_IDS, SLACK_APP_URL } from '../config.js'
import { sendMessageToUser } from '../utils/slack.utils.js'

export const registerRoutes = (receiver, app) => {
  receiver.router.get('/netsuite/oauth_redirect', async (req, res) => {
    try {
      const { state, code, entity, role } = req.query
      const jsonState = Buffer.from(state, 'base64').toString('ascii')
      const { /* nonce, */ user_id } = JSON.parse(jsonState)

      //TODO: ADD CHECK FOR NONCE

      //Only allow the base employee role acess
      if (!role || !NESUITE_ALLOWED_ROLE_IDS.includes(role.toString())) {
        await sendMessageToUser(
          app.client,
          user_id,
          'The selected role is not permitted to use with this application. Please /login with the Employee Own role.'
        )
        return res.redirect(SLACK_APP_URL)
      }

      if (code && entity) {
        // Request Acccess Token
        const token = await getAccessToken(
          user_id,
          code.toString(),
          entity.toString()
        )
        await sendMessageToUser(
          app.client,
          user_id,
          token?.access_token
            ? 'Successfully connected with NetSuite.'
            : 'Failed to retrieve access token from NetSuite, please contact support.'
        )
        //Redirect the user the app redirect page
        return res.redirect(SLACK_APP_URL)
      } else {
        throw new Error('No authCode returned from Netsuite')
      }
    } catch (error) {
      console.error('Failed to get access token from NetSuite', error)
      return res.status(500).send('Failed OAuth Flow. Please try again.')
    }
  })
}
