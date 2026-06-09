import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
    // Files ESLint should not look at.
    { ignores: ["node_modules/", "dist/", "coverage/", "test/fixtures/"] },

    // Base recommended rules for JS and TypeScript.
    js.configs.recommended,
    ...tseslint.configs.recommended,

    // Turn off formatting rules that would conflict with Prettier (must come last).
    eslintConfigPrettier,
);
