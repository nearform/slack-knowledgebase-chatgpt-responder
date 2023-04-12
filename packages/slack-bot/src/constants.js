export const protectedPages = [
  'Annual Leave policies',
  'Employee Bonus Plan',
  'Remote Working Support policies',
  'Sabbatical',
  'Marriage leave',
  'Compassionate Leave',
  'COVID 19 Support',
  'Jury Service',
  'Public Holidays',
  'Sick Leave',
  'Probation period'
]

export const protectedPagesList = protectedPages
  .map(page => `- ${page}`)
  .join('\n')
