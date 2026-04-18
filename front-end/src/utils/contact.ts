export const boardContactMethods = [
  'email',
  'phone',
] as const

export type BoardContactMethod = (typeof boardContactMethods)[number]

export const boardContactMethodOptions = [
  { value: 'email' as const, label: 'Email' },
  { value: 'phone' as const, label: 'Phone' },
]

export function normalizeBoardContactMethod(value: string | undefined): BoardContactMethod {
  return value === 'phone' ? 'phone' : 'email'
}

export function getBoardContactValueLabel(method: BoardContactMethod) {
  return method === 'email' ? 'Email address' : 'Phone number'
}

export function getBoardContactValuePlaceholder(method: BoardContactMethod) {
  return method === 'email' ? 'jane@email.com' : '555-123-4567'
}

export function getBoardContactValueType(method: BoardContactMethod) {
  return method === 'email' ? 'email' : 'tel'
}

export function getBoardContactValueAutocomplete(method: BoardContactMethod) {
  return method === 'email' ? 'email' : 'tel'
}

export function getBoardContactValueInputMode(method: BoardContactMethod) {
  return method === 'email' ? 'email' : 'tel'
}
