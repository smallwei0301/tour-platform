# @tour-platform/config

共用配置包（ESLint、TypeScript、Tailwind）

## 使用方式

在 monorepo 各個 package 中引入：

```js
// .eslintrc.js
module.exports = require('@tour-platform/config/.eslintrc');

// tsconfig.json
{
  "extends": "@tour-platform/config/tsconfig.json"
}
```

## 結構

- `.eslintrc.js` — ESLint 規則
- `tailwind.config.js` — Tailwind CSS 配置
- `tsconfig.json` — TypeScript 共用配置

---

最後更新：2026-04-06
