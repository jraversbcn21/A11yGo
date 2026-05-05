import globals from "globals";

export default [
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2021,
        chrome: "readonly",
        CSS: "readonly",
        Node: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
      "no-redeclare": "error",
      "no-constant-condition": "warn",
      "no-debugger": "error",
      "no-duplicate-case": "error",
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-extra-semi": "warn",
      "no-unreachable": "warn",
      "eqeqeq": ["warn", "smart"],
      "no-caller": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-wrappers": "error",
      "no-throw-literal": "error"
    }
  },
  {
    files: ["content.js"],
    languageOptions: {
      sourceType: "script"
    }
  },
  {
    ignores: ["node_modules/", "dist/"]
  }
];
