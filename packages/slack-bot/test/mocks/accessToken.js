import { Timestamp } from 'firebase/firestore'

export const mockAccessToken = {
  access_token: 'eyJraWQiOiJjLjY5ODk5NDNfU0IyLjIwMjMtMDUtMTRfMDAtMTAtMDc',
  employee_id: '0001',
  expires_at: Timestamp.fromDate(new Date('2019-07-06T20:00:00')),
  expires_in: 3600,
  refresh_token: 'eyJraWQiOiJjLjY5ODk5NDNfU0IyLjIDk5NDNfU0IyLjIwMjMtMDUt',
  token_type: 'Bearer'
}
