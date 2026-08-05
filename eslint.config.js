import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        // 浏览器与扩展环境
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        matchMedia: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        URL: "readonly",
        Blob: "readonly",
        chrome: "readonly",
        browser: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": "off",
      eqeqeq: "error",
      "no-var": "error",
      "prefer-const": "error",
    },
  },
  {
    files: ["tests/**/*.mjs", "scripts/*.mjs", "build.mjs"],
    languageOptions: {
      globals: {
        // 显式屏蔽浏览器全局：Node 文件误触浏览器 API 时应被 no-undef 拦截
        window: "off",
        document: "off",
        navigator: "off",
        localStorage: "off",
        matchMedia: "off",
        URL: "off",
        Blob: "off",
        chrome: "off",
        browser: "off",
        process: "readonly",
        console: "readonly",
      },
    },
  },
];
