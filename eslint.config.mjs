import cds from '@sap/cds/eslint.config.mjs'
export default [
  ...cds.recommended,
  {
    // browser APIs used by the photo evidence capture dialog
    files: ['app/**/*.js'],
    languageOptions: {
      globals: { navigator: 'readonly', alert: 'readonly', File: 'readonly', FileReader: 'readonly', crypto: 'readonly' }
    }
  }
]
