import { describe, test, mock } from 'node:test'
import sinon from 'sinon'

// isLocalEnvironment is read when utils.js loads, so the bucket branch is only
// reachable if the variable is cleared before the import below. mock.module
// registers a specifier once per process, which is why this lives in a test
// file of its own.
delete process.env.IS_LOCAL_ENVIRONMENT

const fileDownloadMock = sinon.spy(async () => {})
const bucketFileMock = sinon.spy(() => ({ download: fileDownloadMock }))
const storageBucketMock = sinon.spy(() => ({ file: bucketFileMock }))

mock.module('@google-cloud/storage', {
  namedExports: {
    Storage: class StorageMock {
      bucket = storageBucketMock
    }
  }
})

const { download, isLocalEnvironment } = await import('../src/utils.js')

describe('download', () => {
  test('downloads the bucket file to the destination it was given', async t => {
    t.assert.strictEqual(
      isLocalEnvironment,
      false,
      'the bucket branch is only reached outside a local environment'
    )

    const bucketName = 'a-bucket'
    const bucketFileName = 'embeddings.csv'
    const destination = '/tmp/embeddings-for-this-process.csv'

    await download(bucketName, bucketFileName, destination)

    sinon.assert.calledOnceWithExactly(storageBucketMock, bucketName)
    sinon.assert.calledOnceWithExactly(bucketFileMock, bucketFileName)

    // The destination is deliberately not the bucket file name: writing to the
    // bucket file name leaves the caller's destination missing.
    sinon.assert.calledOnceWithExactly(fileDownloadMock, { destination })
  })
})
