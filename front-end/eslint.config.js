// @ts-check
import { createConfigForNuxt } from '@nuxt/eslint-config'

export default createConfigForNuxt(
  {
    features: {
      formatters: true,
      nuxt: {
        sortConfigKeys: true,
      },
    },
  },
  {
    rules: {
      'pnpm/json-enforce-catalog': 'off',
      'vue/multi-word-component-names': 'off',
    },
  },
)
