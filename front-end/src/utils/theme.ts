export type ThemeValue = 'dark' | 'light'

export interface ThemeSchemeSwatch {
  accent: string
  surface: string
  text: string
}

export interface ThemeSchemeOption {
  description: string
  id: string
  isDefault?: boolean
  label: string
  swatches: {
    dark: ThemeSchemeSwatch
    light: ThemeSchemeSwatch
  }
}

export const themeSchemeOptions = [
  {
    id: 'foundry',
    label: 'Foundry',
    description: 'The existing mint-and-graphite community board look.',
    isDefault: true,
    swatches: {
      light: {
        accent: '#136c59',
        surface: '#f5f4ef',
        text: '#121715',
      },
      dark: {
        accent: '#5ac3a8',
        surface: '#0d1110',
        text: '#f4f6f5',
      },
    },
  },
  {
    id: 'ledger',
    label: 'Ledger',
    description: 'Cool slate surfaces with a cobalt signal accent.',
    isDefault: false,
    swatches: {
      light: {
        accent: '#2557d6',
        surface: '#f4f5f8',
        text: '#121722',
      },
      dark: {
        accent: '#7ea2ff',
        surface: '#0d1117',
        text: '#f4f7fb',
      },
    },
  },
  {
    id: 'ember',
    label: 'Ember',
    description: 'Warm stone surfaces with a restrained copper accent.',
    isDefault: false,
    swatches: {
      light: {
        accent: '#a85a30',
        surface: '#f6f2ed',
        text: '#1c1613',
      },
      dark: {
        accent: '#e09a64',
        surface: '#120f0d',
        text: '#f6f1ed',
      },
    },
  },
] as const satisfies readonly ThemeSchemeOption[]

export type ThemeSchemeId = (typeof themeSchemeOptions)[number]['id']

export const defaultThemeScheme: ThemeSchemeId = themeSchemeOptions.find(option => option.isDefault)?.id || themeSchemeOptions[0].id

export function isDarkThemeValue(value: string) {
  return value === 'dark'
}

export function getThemeTogglePreference(value: string): ThemeValue {
  return isDarkThemeValue(value) ? 'light' : 'dark'
}

export function normalizeThemeScheme(value?: string | null): ThemeSchemeId {
  return themeSchemeOptions.some(option => option.id === value)
    ? value as ThemeSchemeId
    : defaultThemeScheme
}
