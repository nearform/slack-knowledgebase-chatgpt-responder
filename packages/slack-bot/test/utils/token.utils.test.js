import { test } from 'tap'
import sinon from 'sinon'
import {
  createExpiryTimestamp,
  isValidToken
} from '../../src/utils/token.utils.js'
import { mockAccessToken } from '../mocks/accessToken.js'
import { Timestamp } from 'firebase-admin/firestore'

test('createExpiryTimestamp', async t => {
  const mockDate = new Date('2019-07-06T20:00:00')

  const clock = sinon.useFakeTimers(mockDate)

  t.teardown(() => {
    clock.restore()
  })

  t.test(
    'should add a number value of 3600 seconds to the current date',
    async tt => {
      const mockSeconds = 3600
      const timestamp = createExpiryTimestamp(mockSeconds)
      tt.same(timestamp.seconds, mockDate.getTime() / 1000 + mockSeconds)
      tt.same(timestamp.nanoseconds, 0)
    }
  )

  t.test(
    'should add a string value of 3600 seconds to the current date',
    async tt => {
      const mockSeconds = '3600'
      const timestamp = createExpiryTimestamp(mockSeconds)
      tt.same(
        timestamp.seconds,
        mockDate.getTime() / 1000 + Number(mockSeconds)
      )
      tt.same(timestamp.nanoseconds, 0)
    }
  )

  t.test(
    'should return the current date when the string value is not a number',
    async tt => {
      const timestamp = createExpiryTimestamp('test')
      tt.same(timestamp.seconds, mockDate.getTime() / 1000)
      tt.same(timestamp.nanoseconds, 0)
    }
  )
})

test('isValidToken', async t => {
  t.test('should fail when the expires_at has been exceeded', async tt => {
    const result = isValidToken(mockAccessToken)
    tt.notOk(result)
  })

  t.test('should pass when the expires_at is in the future', async tt => {
    const mockDate = new Date()
    mockDate.setMonth(mockDate.getMonth() + 1)
    const result = isValidToken({
      ...mockAccessToken,
      expires_at: Timestamp.fromDate(mockDate)
    })
    tt.ok(result)
  })
})
