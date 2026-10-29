import js from '@eslint/js';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        // ponytail: existing violations are warnings so CI can gate new code; promote to errors once fixed.
        rules: { 'no-unused-vars': 'warn', 'preserve-caught-error': 'warn' },
    },
    {
        files: ['app.js', 'analyzer.js'],
        languageOptions: { sourceType: 'commonjs', globals: globals.node },
    },
    {
        // Loaded via <script type="module">, with a module.exports guard for tests.
        files: ['frontend.js'],
        languageOptions: { globals: { ...globals.browser, module: 'readonly' } },
    },
    {
        files: ['tests/**', '*.config.*'],
        languageOptions: { globals: globals.node },
    },
    {
        files: ['tests/frontend.test.js'],
        languageOptions: { globals: globals.browser },
    },
];
