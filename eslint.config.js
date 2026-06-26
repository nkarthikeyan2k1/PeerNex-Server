const js = require("@eslint/js");
const globals = require("globals");

// Flat config (ESLint v9). CommonJS, Node globals. `npm run lint` is wired in
// package.json and the .github ESLint workflow runs it on push/PR.
module.exports = [
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      // console is only allowed inside lib/logger.js (disabled there); use the
      // logger everywhere else.
      "no-console": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Dev/verification scripts print directly to the console.
    files: ["scripts/**/*.js"],
    rules: { "no-console": "off" },
  },
];
