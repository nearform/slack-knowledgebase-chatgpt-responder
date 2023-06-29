import { test } from 'tap'
import { sendMessageToUser } from '../../src/utils/slack.utils.js'

test('sendMessageToUser: should return okay for valid params', async t => {
  t.plan(3)
  const userId = 'userId123'
  const message = 'Testing value'
  const client = {
    chat: {
      postMessage: async ({ channel, text }) => {
        t.equal(channel, userId)
        t.equal(text, message)
        return true
      }
    }
  }
  t.ok(await sendMessageToUser(client, userId, message))
})

test('sendMessageToUser: should fail if slack client fails', async t => {
  t.plan(3)
  const userId = 'userId123'
  const message = 'Testing value'
  const client = {
    chat: {
      postMessage: async ({ channel, text }) => {
        t.equal(channel, userId)
        t.equal(text, message)
        throw new Error('Failed request!')
      }
    }
  }
  t.rejects(sendMessageToUser(client, userId, message))
})
