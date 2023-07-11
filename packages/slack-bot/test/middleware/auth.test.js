import { test } from 'tap'
import sinon from 'sinon'
import esmock from 'esmock'
import { mockAccessToken } from '../mocks/accessToken.js'

test('openOAuthURL should open with the correct uri and state params', async t => {
  t.test('should refresh the token if it is not valid', async tt => {
    const getTokenMock = sinon.fake.resolves(mockAccessToken)
    const isValidTokenMock = sinon.fake.returns(false)
    const refreshTokenMock = sinon.fake()
    const next = sinon.fake()

    const { authMiddleware } = await esmock('../../src/middleware/auth.js', {
      '../../src/services/token.service.js': {
        getToken: getTokenMock
      },
      '../../src/utils/token.utils.js': {
        isValidToken: isValidTokenMock
      },
      '../../src/utils/netsuite.utils.js': {
        refreshToken: refreshTokenMock
      }
    })

    await authMiddleware({ payload: { user: 'mock-user' }, context: {}, next })

    sinon.assert.calledOnceWithExactly(getTokenMock, 'mock-user')
    sinon.assert.calledOnceWithExactly(isValidTokenMock, mockAccessToken)
    sinon.assert.calledOnceWithExactly(
      refreshTokenMock,
      'mock-user',
      mockAccessToken.refresh_token
    )
    sinon.assert.calledOnce(next)

    tt.end()
  })

  t.test('should not refresh the token if it is valid', async tt => {
    const getTokenMock = sinon.fake.resolves(mockAccessToken)
    const isValidTokenMock = sinon.fake.returns(true)
    const refreshTokenMock = sinon.fake()
    const next = sinon.fake()

    const { authMiddleware } = await esmock('../../src/middleware/auth.js', {
      '../../src/services/token.service.js': {
        getToken: getTokenMock
      },
      '../../src/utils/token.utils.js': {
        isValidToken: isValidTokenMock
      },
      '../../src/utils/netsuite.utils.js': {
        refreshToken: refreshTokenMock
      }
    })

    await authMiddleware({ payload: { user: 'mock-user' }, context: {}, next })

    sinon.assert.calledOnceWithExactly(getTokenMock, 'mock-user')
    sinon.assert.calledOnceWithExactly(isValidTokenMock, mockAccessToken)
    sinon.assert.notCalled(refreshTokenMock)
    sinon.assert.calledOnce(next)

    tt.end()
  })

  t.test(
    'should ony call next if there is no userID present in payload',
    async tt => {
      const getTokenMock = sinon.fake()
      const isValidTokenMock = sinon.fake()
      const refreshTokenMock = sinon.fake()
      const next = sinon.fake()

      const { authMiddleware } = await esmock('../../src/middleware/auth.js', {
        '../../src/services/token.service.js': {
          getToken: getTokenMock
        },
        '../../src/utils/token.utils.js': {
          isValidToken: isValidTokenMock
        },
        '../../src/utils/netsuite.utils.js': {
          refreshToken: refreshTokenMock
        }
      })

      await authMiddleware({ payload: {}, context: {}, next })

      sinon.assert.notCalled(getTokenMock)
      sinon.assert.notCalled(isValidTokenMock)
      sinon.assert.notCalled(refreshTokenMock)
      sinon.assert.calledOnce(next)

      tt.end()
    }
  )
})
