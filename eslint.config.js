import tsParser from "@typescript-eslint/parser";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default [
  {
    ignores: ["dist/**", "dist-server/**", "dev-dist/**", "node_modules/**"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      ...reactHooksPlugin.configs.recommended.rules,
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
];
