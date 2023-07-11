import { query, getOAuthURL } from '../utils/netsuite.utils.js'
import { isValidToken } from '../utils/token.utils.js'

const login = async ({ payload, ack, respond }) => {
  // Acknowledge command request
  await ack()

  // Verify the user_id exists on the payload
  if (payload.user_id) {
    await respond({
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Hey <@${payload.user_id}>, please login to your NetSuite account to continue.`
          },
          accessory: {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Connect'
            },
            action_id: 'netsuite_connect_btn',
            url: getOAuthURL(payload.user_id)
          }
        }
      ],
      text: `Hey <@${payload.user_id}>, please connect your NetSuite account to continue.`
    })
  } else {
    console.error('No user_id present in the payload', payload)
    await respond(`Could not determine your Slack user id.`)
  }
}

const queryNetsuite = async ({ ack, respond, context }) => {
  // Acknowledge command request
  await ack()

  try {
    const netsuiteToken = context.netsuiteToken

    if (isValidToken(netsuiteToken)) {
      // Query NetSuite for employee information
      const employeeData = await query({
        q: `SELECT employee.entityid as name, employee.id from employee WHERE id=${netsuiteToken.employee_id}`,
        authToken: netsuiteToken.access_token
      })

      const { id: employeeID, name: employeeName } = employeeData.items[0]

      await respond(JSON.stringify({ employeeID, employeeName }))
    } else {
      await respond('Token is not present or expired.')
    }
  } catch (error) {
    console.log(error)
    await respond('Failed to query NetSuite.')
  }
}

export const registerCommands = app => {
  app.command('/query', queryNetsuite)
  app.command('/login', login)
}
