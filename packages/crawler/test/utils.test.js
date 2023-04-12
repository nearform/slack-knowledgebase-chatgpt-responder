import tap from 'tap'
import { createCsv } from '../src/utils.js'

tap.test('createCsv works correctly', async t => {
  const actual = await createCsv([
    { index: 0, title: 'Super blog post', text: 'This is awesome!' },
    { index: 1, title: 'Testing with snapshots', text: 'It is super simple!' }
  ])

  const expected = `index,title,text
0,Super blog post,This is awesome!
1,Testing with snapshots,It is super simple!`

  t.equal(actual, expected)
})
