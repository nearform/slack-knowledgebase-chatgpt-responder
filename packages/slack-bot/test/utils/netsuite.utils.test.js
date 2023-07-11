import { test } from 'tap'
import sinon from 'sinon'
import esmock from 'esmock'
import { mockNetSuiteResponse } from '../mocks/accessToken.js'
import { createExpiryTimestamp } from '../../src/utils/token.utils.js'

test('getAuthEndpoint should return the correct uri', async t => {
  const state = 'mock-state'
  const accountId = 'account-id'
  const clientId = 'client-id'
  const redirectUri = 'redirect-uri'

  const { getAuthEndpoint } = await esmock(
    '../../src/utils/netsuite.utils.js',
    {
      '../../src/config.js': {
        NETSUITE_ACCOUNT_ID: accountId,
        NETSUITE_CLIENT_ID: clientId,
        NETSUITE_REDIRECT_URI: redirectUri
      }
    }
  )

  const result = getAuthEndpoint(state)

  t.same(
    result,
    `https://${accountId}.app.netsuite.com/app/login/oauth2/authorize.nl?scope=rest_webservices&response_type=code&client_id=${clientId}&state=${state}&redirect_uri=${redirectUri}`
  )
})

test('getAccessToken', async t => {
  const mockDate = new Date('2019-07-06T20:00:00')
  const clock = sinon.useFakeTimers(mockDate)
  const mockTokenEndpoint = 'http://fake-netsuite.com/auth'
  const mockRedirectUri = 'http://fake-redirect.com/auth'
  const mockClientId = 'mock-client-id'
  const mockSecret = 'mock-secret'
  const mockEmployeeId = '999'
  const mockAuthHeader = `Basic ${Buffer.from(
    `${mockClientId}:${mockSecret}`
  ).toString('base64')}`

  t.teardown(() => {
    clock.restore()
  })

  t.test(
    'should return the expected access token and call setToken',
    async tt => {
      const fakeJson = sinon.fake.resolves(mockNetSuiteResponse)
      const fetchMock = sinon
        .stub()
        .returns({ ok: true, status: 200, json: fakeJson })
      global.fetch = fetchMock
      const setTokenMock = sinon.fake()
      const { getAccessToken } = await esmock(
        '../../src/utils/netsuite.utils.js',
        {
          '../../src/config.js': {
            NETSUITE_TOKEN_ENDPOINT: mockTokenEndpoint,
            NETSUITE_REDIRECT_URI: mockRedirectUri,
            NETSUITE_CLIENT_ID: mockClientId,
            NETSUITE_SECRET: mockSecret
          },
          '../../src/services/token.service.js': {
            setToken: setTokenMock
          }
        }
      )
      const result = await getAccessToken(
        'mock-user',
        'auth-code',
        mockEmployeeId
      )
      const expectedResult = {
        ...mockNetSuiteResponse,
        employee_id: mockEmployeeId,
        expires_at: createExpiryTimestamp(mockNetSuiteResponse.expires_in)
      }

      sinon.assert.calledOnceWithExactly(fetchMock, mockTokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: mockAuthHeader
        },
        body: new URLSearchParams({
          code: 'auth-code',
          grant_type: 'authorization_code',
          redirect_uri: mockRedirectUri
        })
      })
      sinon.assert.calledOnceWithExactly(
        setTokenMock,
        'mock-user',
        expectedResult
      )
      tt.same(result, expectedResult)
    }
  )

  t.test(
    'should return null when the fetch to netsuite fails and not call setToken',
    async tt => {
      const fakeJson = sinon.fake.resolves({ error: 'invalid_grant' })
      const fetchMock = sinon
        .stub()
        .returns({ ok: false, status: 400, json: fakeJson })
      global.fetch = fetchMock
      const setTokenMock = sinon.fake()
      const { getAccessToken } = await esmock(
        '../../src/utils/netsuite.utils.js',
        {
          '../../src/config.js': {
            NETSUITE_TOKEN_ENDPOINT: mockTokenEndpoint,
            NETSUITE_REDIRECT_URI: mockRedirectUri,
            NETSUITE_CLIENT_ID: mockClientId,
            NETSUITE_SECRET: mockSecret
          },
          '../../src/services/token.service.js': {
            setToken: setTokenMock
          }
        }
      )
      const result = await getAccessToken('mock-user', 'auth-code', '999')
      tt.notOk(result)
      sinon.assert.notCalled(setTokenMock)
    }
  )
})

test('refreshToken', async t => {
  const mockDate = new Date('2019-07-06T20:00:00')
  const clock = sinon.useFakeTimers(mockDate)
  const mockTokenEndpoint = 'http://fake-netsuite.com/auth'
  const mockRedirectUri = 'http://fake-redirect.com/auth'
  const mockClientId = 'mock-client-id'
  const mockSecret = 'mock-secret'
  const mockEmployeeId = '999'
  const mockAuthHeader = `Basic ${Buffer.from(
    `${mockClientId}:${mockSecret}`
  ).toString('base64')}`

  t.teardown(() => {
    clock.restore()
  })

  t.test(
    'should return the expected access token and call setToken',
    async tt => {
      const fakeJson = sinon.fake.resolves(mockNetSuiteResponse)
      const fetchMock = sinon
        .stub()
        .returns({ ok: true, status: 200, json: fakeJson })
      global.fetch = fetchMock
      const setTokenMock = sinon.fake()

      const { refreshToken } = await esmock(
        '../../src/utils/netsuite.utils.js',
        {
          '../../src/config.js': {
            NETSUITE_TOKEN_ENDPOINT: mockTokenEndpoint,
            NETSUITE_REDIRECT_URI: mockRedirectUri,
            NETSUITE_CLIENT_ID: mockClientId,
            NETSUITE_SECRET: mockSecret
          },
          '../../src/services/token.service.js': {
            setToken: setTokenMock
          }
        }
      )

      const result = await refreshToken('mock-user', 'refresh-token')
      const expectedResult = {
        ...mockNetSuiteResponse,
        employee_id: mockEmployeeId,
        expires_at: createExpiryTimestamp(mockNetSuiteResponse.expires_in)
      }

      sinon.assert.calledOnceWithExactly(fetchMock, mockTokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: mockAuthHeader
        },
        body: new URLSearchParams({
          refresh_token: 'refresh-token',
          grant_type: 'refresh_token'
        })
      })
      sinon.assert.calledOnceWithExactly(
        setTokenMock,
        'mock-user',
        expectedResult
      )
      tt.same(result, expectedResult)
    }
  )

  t.test(
    'should return null when the fetch to netsuite fails and not call setToken',
    async tt => {
      const fakeJson = sinon.fake.resolves({ error: 'invalid_grant' })
      const fetchMock = sinon
        .stub()
        .returns({ ok: false, status: 400, json: fakeJson })
      global.fetch = fetchMock
      const setTokenMock = sinon.fake()
      const { refreshToken } = await esmock(
        '../../src/utils/netsuite.utils.js',
        {
          '../../src/config.js': {
            NETSUITE_TOKEN_ENDPOINT: mockTokenEndpoint,
            NETSUITE_REDIRECT_URI: mockRedirectUri,
            NETSUITE_CLIENT_ID: mockClientId,
            NETSUITE_SECRET: mockSecret
          },
          '../../src/services/token.service.js': {
            setToken: setTokenMock
          }
        }
      )
      const result = await refreshToken('mock-user', 'refresh-token')
      tt.notOk(result)
      sinon.assert.notCalled(setTokenMock)
    }
  )
})

test('query', async t => {
  t.test('should fail if authToken not provided', async tt => {
    const { query } = await esmock('../../src/utils/netsuite.utils.js', {
      '../../src/config.js': {
        NETSUITE_ACCOUNT_ID: 'mock-account-id'
      }
    })
    try {
      await query({ q: 'SELECT * from test' })
      sinon.assert.fail('Should not get here')
    } catch (err) {
      tt.same(
        err.message,
        'Please connect to NetSuite and provide the auth token to query'
      )
    }
    tt.end()
  })

  t.test('should fail if query not provided', async tt => {
    const { query } = await esmock('../../src/utils/netsuite.utils.js', {
      '../../src/config.js': {
        NETSUITE_ACCOUNT_ID: 'mock-account-id'
      }
    })
    try {
      await query({ authToken: 'mock-token' })
      sinon.assert.fail('Should not get here')
    } catch (err) {
      tt.same(err.message, 'Please provide a query')
    }
    tt.end()
  })

  t.test('should return employee data', async tt => {
    const mockData = { employeeID: '9999', employeeName: 'Test Employee' }
    const fakeJson = sinon.fake.resolves(mockData)
    const fetchMock = sinon
      .stub()
      .returns({ ok: true, status: 200, json: fakeJson })
    global.fetch = fetchMock
    const mockAccountId = 'mock-account-id'
    const { query } = await esmock('../../src/utils/netsuite.utils.js', {
      '../../src/config.js': {
        NETSUITE_ACCOUNT_ID: 'mock-account-id'
      }
    })
    const mockQuery =
      'SELECT employee.entityid as name, employee.id from employee WHERE id=9999'
    const result = await query({ q: mockQuery, authToken: 'mock-access-token' })
    sinon.assert.calledOnceWithMatch(
      fetchMock,
      `https://${mockAccountId}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`,
      { body: JSON.stringify({ q: mockQuery }) }
    )
    tt.same(result, mockData)
  })
})

test('getOAuthURL should open with the correct uri and state params', async t => {
  const mockAccountId = 'mock-account-id'
  const mockClientId = 'mock-client-id'
  const mockReturnUri = 'http://fake-redirect.com/auth'
  const mockUserId = 'mock-user-id'
  const mockNonce = Buffer.from('123456789')
  const { getOAuthURL } = await esmock('../../src/utils/netsuite.utils.js', {
    '../../src/config.js': {
      NETSUITE_ACCOUNT_ID: mockAccountId,
      NETSUITE_CLIENT_ID: mockClientId,
      NETSUITE_REDIRECT_URI: 'http://fake-redirect.com/auth'
    },
    crypto: {
      randomBytes: () => mockNonce
    }
  })

  const expectedState = Buffer.from(
    JSON.stringify({ nonce: mockNonce.toString('base64'), user_id: mockUserId })
  ).toString('base64')

  const result = await getOAuthURL(mockUserId)

  t.same(
    result,
    `https://${mockAccountId}.app.netsuite.com/app/login/oauth2/authorize.nl?scope=rest_webservices&response_type=code&client_id=${mockClientId}&state=${expectedState}&redirect_uri=${mockReturnUri}`
  )

  t.end()
})
