import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  {
    // Posts are prose, so allow literal quotes and apostrophes in JSX text.
    rules: {
      "react/no-unescaped-entities": "off",
    },
  },
  {
    ignores: [".next/**", "out/**", "next-env.d.ts"],
  },
];

export default eslintConfig;
