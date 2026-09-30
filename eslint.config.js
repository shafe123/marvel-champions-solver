import js from "@eslint/js";

const browserGlobals = {
  console: "readonly",
  document: "readonly",
  Worker: "readonly",
  URL: "readonly",
  self: "readonly",
};

export default [
  {
    ignores: ["dist/**", ".venv/**"],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: {
      globals: browserGlobals,
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
      },
    },
  },
];
