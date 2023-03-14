import json2csv from 'json-2-csv'

export const generateCsv = async (
  data: {
    title: string | null
    content: string
  }[]
) => {
  return json2csv.json2csvAsync(data)
}
