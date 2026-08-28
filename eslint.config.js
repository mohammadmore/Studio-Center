import html from "eslint-plugin-html";
export default [
  {
    plugins: { html },
    languageOptions: { globals: { window: true, document: true } },
    rules: { "no-unused-vars": "off", "no-undef": "off" }
  }
];
