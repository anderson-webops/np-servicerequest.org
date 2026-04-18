export const boardContactMethods = [
  'email',
  'phone',
] as const

export type BoardContactMethod = (typeof boardContactMethods)[number]

interface NormalizeStructuredContactInput {
  legacyContact?: string
  method?: string
  note?: string
  value?: string
}

export interface NormalizedStructuredContact {
  display: string
  invalidMethod: boolean
  invalidValue: boolean
  managementEmail: string
  method: BoardContactMethod | null
  note: string
  usedLegacyContact: boolean
  value: string
}

function cleanValue(value: string | undefined) {
  return value?.trim() || ''
}

export function isEmailAddress(value: string) {
  return value.includes('@') && !/\s/.test(value)
}

function looksLikePhoneNumber(value: string) {
  const digits = value.replaceAll(/\D/g, '')
  return digits.length >= 7
}

export function isStructuredContactMethod(value: string): value is BoardContactMethod {
  return boardContactMethods.includes(value as BoardContactMethod)
}

export function getStructuredContactMethodLabel(method: BoardContactMethod) {
  return method === 'email' ? 'Email' : 'Phone'
}

export function formatStructuredContactDisplay(input: {
  method: BoardContactMethod
  note?: string
  value: string
}) {
  const value = cleanValue(input.value)

  if (!value)
    return ''

  const note = cleanValue(input.note)
  const methodLabel = getStructuredContactMethodLabel(input.method)
  return note ? `${methodLabel}: ${value} (${note})` : `${methodLabel}: ${value}`
}

function validateStructuredContactValue(method: BoardContactMethod, value: string) {
  if (!value)
    return false

  if (method === 'email')
    return isEmailAddress(value)

  return looksLikePhoneNumber(value)
}

export function normalizeStructuredContact(input: NormalizeStructuredContactInput): NormalizedStructuredContact {
  const legacyContact = cleanValue(input.legacyContact)
  const providedValue = cleanValue(input.value)
  const note = cleanValue(input.note)
  const usedLegacyContact = !providedValue && Boolean(legacyContact)
  const value = providedValue || legacyContact
  const hasMethodInput = cleanValue(input.method).length > 0
  const invalidMethod = hasMethodInput && !isStructuredContactMethod(cleanValue(input.method))
  const method = invalidMethod
    ? null
    : hasMethodInput
      ? cleanValue(input.method) as BoardContactMethod
      : providedValue
        ? isEmailAddress(providedValue) ? 'email' : 'phone'
        : isEmailAddress(legacyContact)
          ? 'email'
          : null

  const invalidValue = Boolean(providedValue && method && !validateStructuredContactValue(method, providedValue))
  const display = usedLegacyContact
    ? legacyContact
    : method && providedValue
      ? formatStructuredContactDisplay({
          method,
          note,
          value: providedValue,
        })
      : ''

  return {
    display,
    invalidMethod,
    invalidValue,
    managementEmail: method === 'email' && !invalidValue ? value : '',
    method,
    note,
    usedLegacyContact,
    value,
  }
}
