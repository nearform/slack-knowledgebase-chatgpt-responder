import { json2csv } from 'json-2-csv'

export const generateCsv = data => {
  return json2csv(data)
}
