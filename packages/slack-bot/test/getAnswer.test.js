import tap from 'tap'
import esmock from 'esmock'

tap.test('getAnswer', async t => {
  t.test('returns expected answer', async tt => {
    const { getAnswer } = await esmock('../src/getAnswer.js')

    const actual = await getAnswer({ question: 'question' })
    const expected = 'You said: question'
    tt.equal(actual, expected)
  })
})
