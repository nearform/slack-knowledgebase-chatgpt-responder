import tap from 'tap'
import { getAnswer } from '../src/getAnswer.js'

tap.test('getAnswer', async t => {
  t.test('returns expected answer', async tt => {
    const actual = await getAnswer('question')
    const expected = 'You said: question'
    tt.equal(actual, expected)
  })
})
