export type ThemeValue = 'dark' | 'light'

export const themeModes = ['light', 'dark'] as const satisfies readonly ThemeValue[]

export const themeCssVariableNames = [
  'site-bg-start',
  'site-bg-end',
  'site-bg-accent',
  'site-text',
  'site-heading',
  'site-text-strong',
  'site-muted',
  'site-subtle',
  'site-link',
  'site-link-hover',
  'site-surface',
  'site-surface-soft',
  'site-surface-strong',
  'site-elevated',
  'site-elevated-strong',
  'site-input-bg',
  'site-input-text',
  'site-border',
  'site-border-strong',
  'site-border-dashed',
  'site-accent-soft',
  'site-accent-soft-strong',
  'site-accent-ghost',
  'site-focus',
  'site-focus-ring',
  'site-button-bg',
  'site-button-bg-hover',
  'site-button-text',
  'site-shadow',
  'site-shadow-strong',
  'site-success-bg',
  'site-success-text',
  'site-error-bg',
  'site-error-text',
  'site-highlight',
  'site-poster-start',
  'site-poster-end',
  'site-header-bg',
  'site-header-border',
] as const

export type ThemeCssVariableName = (typeof themeCssVariableNames)[number]
export type ThemeCssVariable = `--${ThemeCssVariableName}`
export type ThemeTokenSet = Record<ThemeCssVariable, string>

interface ThemeSchemeDefinition {
  description: string
  id: string
  isDefault?: boolean
  label: string
  modes: Record<ThemeValue, ThemeTokenSet>
}

type ThemeSchemeDefinitionList = readonly [ThemeSchemeDefinition, ...ThemeSchemeDefinition[]]

/*
 * Theme scheme integration contract:
 * - Add or edit palette families in this definition list only.
 * - Keep UI components pointed at semantic --site-* CSS variables.
 * - Picker metadata, swatches, theme-color, and injected CSS are generated from these tokens.
 */
export const themeSchemeDefinitions = [
  {
    id: 'foundry',
    label: 'Foundry',
    description: 'The existing moss-and-cream community board look.',
    isDefault: true,
    modes: {
      light: {
        '--site-bg-start': '#f5f0e5',
        '--site-bg-end': '#efe7d8',
        '--site-bg-accent': 'rgba(165, 196, 177, 0.42)',
        '--site-text': '#33433a',
        '--site-heading': '#162219',
        '--site-text-strong': '#17231b',
        '--site-muted': '#6d7267',
        '--site-subtle': '#526257',
        '--site-link': '#294635',
        '--site-link-hover': '#1d3528',
        '--site-surface': 'rgba(255, 250, 243, 0.84)',
        '--site-surface-soft': 'rgba(255, 250, 243, 0.72)',
        '--site-surface-strong': 'rgba(255, 250, 243, 0.96)',
        '--site-elevated': 'rgba(255, 255, 255, 0.78)',
        '--site-elevated-strong': 'rgba(255, 255, 255, 0.96)',
        '--site-input-bg': 'rgba(255, 255, 255, 0.88)',
        '--site-input-text': '#1c2a21',
        '--site-border': 'rgba(40, 58, 45, 0.08)',
        '--site-border-strong': 'rgba(40, 58, 45, 0.12)',
        '--site-border-dashed': 'rgba(40, 58, 45, 0.16)',
        '--site-accent-soft': 'rgba(41, 70, 53, 0.08)',
        '--site-accent-soft-strong': 'rgba(41, 70, 53, 0.22)',
        '--site-accent-ghost': 'rgba(255, 255, 255, 0.16)',
        '--site-focus': 'rgba(41, 70, 53, 0.32)',
        '--site-focus-ring': 'rgba(41, 70, 53, 0.1)',
        '--site-button-bg': '#294635',
        '--site-button-bg-hover': '#1d3528',
        '--site-button-text': '#f8f5ee',
        '--site-shadow': '0 24px 50px rgba(52, 66, 56, 0.08)',
        '--site-shadow-strong': '0 32px 70px rgba(53, 69, 57, 0.14)',
        '--site-success-bg': 'rgba(92, 148, 103, 0.12)',
        '--site-success-text': '#24402e',
        '--site-error-bg': 'rgba(148, 91, 82, 0.12)',
        '--site-error-text': '#6a2d23',
        '--site-highlight': 'rgba(121, 159, 129, 0.12)',
        '--site-poster-start': 'rgba(255, 250, 243, 0.96)',
        '--site-poster-end': 'rgba(244, 234, 216, 0.92)',
        '--site-header-bg': 'linear-gradient(180deg, rgba(245, 240, 229, 0.96), rgba(245, 240, 229, 0.82))',
        '--site-header-border': 'rgba(37, 50, 41, 0.08)',
      },
      dark: {
        '--site-bg-start': '#0d1510',
        '--site-bg-end': '#111c15',
        '--site-bg-accent': 'rgba(89, 124, 102, 0.18)',
        '--site-text': '#d3ddd4',
        '--site-heading': '#eff5ee',
        '--site-text-strong': '#f4f8f1',
        '--site-muted': '#9aa89c',
        '--site-subtle': '#afbaae',
        '--site-link': '#b8d3c0',
        '--site-link-hover': '#d6e7d9',
        '--site-surface': 'rgba(19, 29, 23, 0.84)',
        '--site-surface-soft': 'rgba(19, 29, 23, 0.72)',
        '--site-surface-strong': 'rgba(24, 35, 28, 0.96)',
        '--site-elevated': 'rgba(30, 44, 35, 0.82)',
        '--site-elevated-strong': 'rgba(43, 58, 48, 0.96)',
        '--site-input-bg': 'rgba(15, 23, 18, 0.9)',
        '--site-input-text': '#eff5ee',
        '--site-border': 'rgba(195, 225, 199, 0.1)',
        '--site-border-strong': 'rgba(195, 225, 199, 0.18)',
        '--site-border-dashed': 'rgba(195, 225, 199, 0.24)',
        '--site-accent-soft': 'rgba(142, 177, 149, 0.16)',
        '--site-accent-soft-strong': 'rgba(184, 221, 192, 0.28)',
        '--site-accent-ghost': 'rgba(255, 255, 255, 0.12)',
        '--site-focus': 'rgba(171, 211, 179, 0.38)',
        '--site-focus-ring': 'rgba(171, 211, 179, 0.18)',
        '--site-button-bg': '#d6e7d9',
        '--site-button-bg-hover': '#eef7ef',
        '--site-button-text': '#142019',
        '--site-shadow': '0 24px 50px rgba(0, 0, 0, 0.24)',
        '--site-shadow-strong': '0 32px 70px rgba(0, 0, 0, 0.34)',
        '--site-success-bg': 'rgba(90, 171, 114, 0.16)',
        '--site-success-text': '#dff0e2',
        '--site-error-bg': 'rgba(181, 95, 82, 0.18)',
        '--site-error-text': '#ffd9d1',
        '--site-highlight': 'rgba(171, 211, 179, 0.12)',
        '--site-poster-start': 'rgba(24, 35, 28, 0.96)',
        '--site-poster-end': 'rgba(17, 28, 21, 0.92)',
        '--site-header-bg': 'linear-gradient(180deg, rgba(13, 21, 16, 0.96), rgba(13, 21, 16, 0.82))',
        '--site-header-border': 'rgba(195, 225, 199, 0.1)',
      },
    },
  },
  {
    id: 'ledger',
    label: 'Ledger',
    description: 'Cool slate surfaces with a cobalt signal accent.',
    isDefault: false,
    modes: {
      light: {
        '--site-bg-start': '#f4f5f8',
        '--site-bg-end': '#e9edf3',
        '--site-bg-accent': 'rgba(37, 87, 214, 0.12)',
        '--site-text': '#344052',
        '--site-heading': '#121722',
        '--site-text-strong': '#121722',
        '--site-muted': '#657080',
        '--site-subtle': '#536174',
        '--site-link': '#2557d6',
        '--site-link-hover': '#1c45b0',
        '--site-surface': 'rgba(255, 255, 255, 0.84)',
        '--site-surface-soft': 'rgba(255, 255, 255, 0.72)',
        '--site-surface-strong': 'rgba(255, 255, 255, 0.95)',
        '--site-elevated': 'rgba(255, 255, 255, 0.78)',
        '--site-elevated-strong': 'rgba(255, 255, 255, 0.96)',
        '--site-input-bg': 'rgba(255, 255, 255, 0.9)',
        '--site-input-text': '#121722',
        '--site-border': 'rgba(18, 23, 34, 0.09)',
        '--site-border-strong': 'rgba(18, 23, 34, 0.16)',
        '--site-border-dashed': 'rgba(18, 23, 34, 0.2)',
        '--site-accent-soft': 'rgba(37, 87, 214, 0.12)',
        '--site-accent-soft-strong': 'rgba(37, 87, 214, 0.24)',
        '--site-accent-ghost': 'rgba(255, 255, 255, 0.2)',
        '--site-focus': 'rgba(37, 87, 214, 0.36)',
        '--site-focus-ring': 'rgba(37, 87, 214, 0.12)',
        '--site-button-bg': '#2557d6',
        '--site-button-bg-hover': '#1c45b0',
        '--site-button-text': '#ffffff',
        '--site-shadow': '0 20px 60px rgba(15, 23, 41, 0.1)',
        '--site-shadow-strong': '0 32px 80px rgba(15, 23, 41, 0.16)',
        '--site-success-bg': 'rgba(17, 114, 82, 0.12)',
        '--site-success-text': '#0b5740',
        '--site-error-bg': 'rgba(163, 79, 61, 0.12)',
        '--site-error-text': '#743225',
        '--site-highlight': 'rgba(37, 87, 214, 0.12)',
        '--site-poster-start': 'rgba(255, 255, 255, 0.96)',
        '--site-poster-end': 'rgba(236, 240, 247, 0.92)',
        '--site-header-bg': 'linear-gradient(180deg, rgba(244, 245, 248, 0.96), rgba(244, 245, 248, 0.82))',
        '--site-header-border': 'rgba(18, 23, 34, 0.09)',
      },
      dark: {
        '--site-bg-start': '#0d1117',
        '--site-bg-end': '#101624',
        '--site-bg-accent': 'rgba(64, 110, 225, 0.16)',
        '--site-text': '#d8e1ef',
        '--site-heading': '#f4f7fb',
        '--site-text-strong': '#f4f7fb',
        '--site-muted': '#98a5b8',
        '--site-subtle': '#b2bdd0',
        '--site-link': '#a3bdff',
        '--site-link-hover': '#c4d4ff',
        '--site-surface': 'rgba(17, 22, 33, 0.84)',
        '--site-surface-soft': 'rgba(17, 22, 33, 0.72)',
        '--site-surface-strong': 'rgba(17, 22, 33, 0.95)',
        '--site-elevated': 'rgba(23, 30, 44, 0.82)',
        '--site-elevated-strong': 'rgba(35, 45, 64, 0.96)',
        '--site-input-bg': 'rgba(10, 15, 24, 0.9)',
        '--site-input-text': '#f4f7fb',
        '--site-border': 'rgba(244, 247, 251, 0.08)',
        '--site-border-strong': 'rgba(244, 247, 251, 0.14)',
        '--site-border-dashed': 'rgba(244, 247, 251, 0.22)',
        '--site-accent-soft': 'rgba(126, 162, 255, 0.16)',
        '--site-accent-soft-strong': 'rgba(126, 162, 255, 0.3)',
        '--site-accent-ghost': 'rgba(255, 255, 255, 0.12)',
        '--site-focus': 'rgba(126, 162, 255, 0.38)',
        '--site-focus-ring': 'rgba(126, 162, 255, 0.18)',
        '--site-button-bg': '#a3bdff',
        '--site-button-bg-hover': '#c4d4ff',
        '--site-button-text': '#101a30',
        '--site-shadow': '0 24px 70px rgba(0, 0, 0, 0.34)',
        '--site-shadow-strong': '0 34px 90px rgba(0, 0, 0, 0.42)',
        '--site-success-bg': 'rgba(108, 208, 173, 0.16)',
        '--site-success-text': '#dff6ee',
        '--site-error-bg': 'rgba(225, 155, 135, 0.18)',
        '--site-error-text': '#ffe0d8',
        '--site-highlight': 'rgba(126, 162, 255, 0.13)',
        '--site-poster-start': 'rgba(17, 22, 33, 0.96)',
        '--site-poster-end': 'rgba(13, 18, 29, 0.92)',
        '--site-header-bg': 'linear-gradient(180deg, rgba(13, 17, 23, 0.96), rgba(13, 17, 23, 0.82))',
        '--site-header-border': 'rgba(244, 247, 251, 0.08)',
      },
    },
  },
  {
    id: 'ember',
    label: 'Ember',
    description: 'Warm stone surfaces with a restrained copper accent.',
    isDefault: false,
    modes: {
      light: {
        '--site-bg-start': '#f6f2ed',
        '--site-bg-end': '#eee5db',
        '--site-bg-accent': 'rgba(168, 90, 48, 0.11)',
        '--site-text': '#463a33',
        '--site-heading': '#1c1613',
        '--site-text-strong': '#1c1613',
        '--site-muted': '#776b63',
        '--site-subtle': '#65564e',
        '--site-link': '#8b4725',
        '--site-link-hover': '#6f351b',
        '--site-surface': 'rgba(255, 250, 246, 0.84)',
        '--site-surface-soft': 'rgba(255, 250, 246, 0.72)',
        '--site-surface-strong': 'rgba(255, 252, 249, 0.95)',
        '--site-elevated': 'rgba(255, 255, 255, 0.72)',
        '--site-elevated-strong': 'rgba(255, 255, 255, 0.96)',
        '--site-input-bg': 'rgba(255, 255, 255, 0.88)',
        '--site-input-text': '#1c1613',
        '--site-border': 'rgba(28, 22, 19, 0.09)',
        '--site-border-strong': 'rgba(28, 22, 19, 0.16)',
        '--site-border-dashed': 'rgba(28, 22, 19, 0.22)',
        '--site-accent-soft': 'rgba(168, 90, 48, 0.13)',
        '--site-accent-soft-strong': 'rgba(168, 90, 48, 0.28)',
        '--site-accent-ghost': 'rgba(255, 255, 255, 0.16)',
        '--site-focus': 'rgba(168, 90, 48, 0.34)',
        '--site-focus-ring': 'rgba(168, 90, 48, 0.12)',
        '--site-button-bg': '#8b4725',
        '--site-button-bg-hover': '#6f351b',
        '--site-button-text': '#fff9f3',
        '--site-shadow': '0 20px 60px rgba(31, 19, 16, 0.1)',
        '--site-shadow-strong': '0 32px 80px rgba(31, 19, 16, 0.16)',
        '--site-success-bg': 'rgba(31, 122, 97, 0.12)',
        '--site-success-text': '#195f4a',
        '--site-error-bg': 'rgba(170, 78, 57, 0.13)',
        '--site-error-text': '#77301f',
        '--site-highlight': 'rgba(168, 90, 48, 0.11)',
        '--site-poster-start': 'rgba(255, 250, 246, 0.96)',
        '--site-poster-end': 'rgba(244, 232, 222, 0.92)',
        '--site-header-bg': 'linear-gradient(180deg, rgba(246, 242, 237, 0.96), rgba(246, 242, 237, 0.82))',
        '--site-header-border': 'rgba(28, 22, 19, 0.09)',
      },
      dark: {
        '--site-bg-start': '#120f0d',
        '--site-bg-end': '#171210',
        '--site-bg-accent': 'rgba(224, 154, 100, 0.12)',
        '--site-text': '#e3d8d0',
        '--site-heading': '#f6f1ed',
        '--site-text-strong': '#f6f1ed',
        '--site-muted': '#b3a59c',
        '--site-subtle': '#c4b6ad',
        '--site-link': '#f0b07c',
        '--site-link-hover': '#ffc495',
        '--site-surface': 'rgba(26, 21, 19, 0.84)',
        '--site-surface-soft': 'rgba(26, 21, 19, 0.72)',
        '--site-surface-strong': 'rgba(26, 21, 19, 0.95)',
        '--site-elevated': 'rgba(33, 26, 23, 0.82)',
        '--site-elevated-strong': 'rgba(48, 37, 32, 0.96)',
        '--site-input-bg': 'rgba(18, 13, 11, 0.9)',
        '--site-input-text': '#f6f1ed',
        '--site-border': 'rgba(246, 241, 237, 0.08)',
        '--site-border-strong': 'rgba(246, 241, 237, 0.14)',
        '--site-border-dashed': 'rgba(246, 241, 237, 0.22)',
        '--site-accent-soft': 'rgba(224, 154, 100, 0.16)',
        '--site-accent-soft-strong': 'rgba(224, 154, 100, 0.3)',
        '--site-accent-ghost': 'rgba(255, 255, 255, 0.1)',
        '--site-focus': 'rgba(224, 154, 100, 0.38)',
        '--site-focus-ring': 'rgba(224, 154, 100, 0.18)',
        '--site-button-bg': '#f0b07c',
        '--site-button-bg-hover': '#ffc495',
        '--site-button-text': '#2a1812',
        '--site-shadow': '0 24px 70px rgba(0, 0, 0, 0.34)',
        '--site-shadow-strong': '0 34px 90px rgba(0, 0, 0, 0.42)',
        '--site-success-bg': 'rgba(115, 208, 177, 0.16)',
        '--site-success-text': '#def8ef',
        '--site-error-bg': 'rgba(230, 155, 132, 0.18)',
        '--site-error-text': '#ffe0d7',
        '--site-highlight': 'rgba(224, 154, 100, 0.13)',
        '--site-poster-start': 'rgba(26, 21, 19, 0.96)',
        '--site-poster-end': 'rgba(18, 14, 12, 0.92)',
        '--site-header-bg': 'linear-gradient(180deg, rgba(18, 15, 13, 0.96), rgba(18, 15, 13, 0.82))',
        '--site-header-border': 'rgba(246, 241, 237, 0.08)',
      },
    },
  },
] as const satisfies ThemeSchemeDefinitionList

export type ThemeSchemeId = (typeof themeSchemeDefinitions)[number]['id']

export interface ThemeSchemeSwatch {
  accent: string
  surface: string
  text: string
}

export interface ThemeSchemeOption {
  description: string
  id: ThemeSchemeId
  isDefault?: boolean
  label: string
  swatches: Record<ThemeValue, ThemeSchemeSwatch>
}

export const defaultThemeSchemeDefinition = themeSchemeDefinitions.find(isDefaultThemeSchemeDefinition) ?? themeSchemeDefinitions[0]
export const defaultThemeScheme: ThemeSchemeId = defaultThemeSchemeDefinition.id

export const themeSchemeOptions: readonly ThemeSchemeOption[] = themeSchemeDefinitions.map(option => ({
  id: option.id,
  label: option.label,
  description: option.description,
  isDefault: isDefaultThemeSchemeDefinition(option) ? option.isDefault : undefined,
  swatches: {
    light: createThemeSwatch(option.modes.light),
    dark: createThemeSwatch(option.modes.dark),
  },
}))

export const themeSchemeStyleContent = createThemeSchemeStyleContent()

export function isDarkThemeValue(value: string) {
  return value === 'dark'
}

export function getThemeTogglePreference(value: string): ThemeValue {
  return isDarkThemeValue(value) ? 'light' : 'dark'
}

export function normalizeThemeScheme(value?: string | null): ThemeSchemeId {
  return isThemeSchemeId(value) ? value : defaultThemeScheme
}

export function isThemeSchemeId(value?: string | null): value is ThemeSchemeId {
  return themeSchemeDefinitions.some(option => option.id === value)
}

function createThemeSwatch(tokens: ThemeTokenSet): ThemeSchemeSwatch {
  return {
    accent: tokens['--site-link'],
    surface: tokens['--site-bg-start'],
    text: tokens['--site-heading'],
  }
}

function isDefaultThemeSchemeDefinition(
  option: (typeof themeSchemeDefinitions)[number],
): option is (typeof themeSchemeDefinitions)[number] & { readonly isDefault: true } {
  return 'isDefault' in option && option.isDefault
}

function createThemeSchemeStyleContent() {
  return themeSchemeDefinitions
    .flatMap(option => [
      createThemeBlock(createLightSelector(option), option.modes.light),
      createThemeBlock(createDarkSelector(option), option.modes.dark),
    ])
    .join('\n\n')
}

function createLightSelector(option: (typeof themeSchemeDefinitions)[number]) {
  return option.id === defaultThemeScheme
    ? `:root,\nhtml[data-theme-scheme="${option.id}"]`
    : `html[data-theme-scheme="${option.id}"]`
}

function createDarkSelector(option: (typeof themeSchemeDefinitions)[number]) {
  return option.id === defaultThemeScheme
    ? `html.dark,\nhtml.dark[data-theme-scheme="${option.id}"]`
    : `html.dark[data-theme-scheme="${option.id}"]`
}

function createThemeBlock(selector: string, tokens: ThemeTokenSet) {
  const declarations = themeCssVariableNames.map((name) => {
    const variable = `--${name}` as ThemeCssVariable
    return `  ${variable}: ${tokens[variable]};`
  })

  return `${selector} {\n${declarations.join('\n')}\n}`
}
