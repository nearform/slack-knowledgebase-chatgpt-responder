import dotenv from 'dotenv'
dotenv.config()

import { generateCsv } from './csv'
import { fetchData } from './notion'

fetchData().then(generateCsv)
