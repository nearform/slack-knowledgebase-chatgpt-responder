import { json2csv } from 'json-2-csv'

export const generateCsv = async data => {
  return json2csv(data)
}
