import tap from 'tap'

import { distancesFromEmbeddings } from '../../src/utils/ai.utils.js'
import { queryEmbedding, embeddings } from '../mocks/embeddings.js'

function approximate(number) {
  return Number(number.toFixed(3))
}

tap.test('distancesFromEmbeddings', async t => {
  t.test('returns expected output', async tt => {
    const actual = distancesFromEmbeddings({ queryEmbedding, embeddings })

    // Distances taken from original Python implementation
    const expected = [
      { index: 0, distance: 0.2710862346 },
      { index: 1, distance: 0.3028143658 },
      { index: 2, distance: 0.3167099499 },
      { index: 3, distance: 0.2876332341 },
      { index: 4, distance: 0.2785608068 },
      { index: 5, distance: 0.2696989991 },
      { index: 6, distance: 0.287659683 },
      { index: 7, distance: 0.2970190541 }
    ]

    const approximatedActual = actual.map(({ distance, index }) => ({
      index,
      distance: approximate(distance)
    }))
    const approximatedExpected = expected.map(({ distance, index }) => ({
      index,
      distance: approximate(distance)
    }))

    tt.same(approximatedActual, approximatedExpected)
  })
})
