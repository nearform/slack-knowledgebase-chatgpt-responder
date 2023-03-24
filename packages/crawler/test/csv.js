import tap from 'tap'
import { generateCsv } from '../src/csv.js'

tap.test('csv2json works correctly', async t => {
  t.matchSnapshot(
    await generateCsv([
      { index: 0, title: 'Super blog post', text: 'This is awesome!' },
      { index: 1, title: 'Testing with snapshots', text: 'It is super simple!' }
    ])
  )
})
