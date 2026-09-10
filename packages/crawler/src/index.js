import 'dotenv/config'
import { validateEnv } from './env.js'

validateEnv()

// Dynamic so notion.js does not construct its client, and crawl() cannot start
// a crawl, until the environment has been checked. crawl() only uses the
// storage variables after fetchData() has finished, so validating here is what
// stops a missing bucket name costing a complete crawl.
const { crawl } = await import('./crawl.js')

crawl()
