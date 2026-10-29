import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// typescript-eslint turns off no-undef for .ts files (tsc catches undefined names), so no globals are needed.
export default [
    { ignores: ['dist/'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        // ponytail: existing violations are warnings so CI can gate new code; promote to errors once fixed.
        rules: {
            '@typescript-eslint/no-unused-vars': 'warn',
            'preserve-caught-error': 'warn',
            'prefer-const': 'warn',
            '@typescript-eslint/no-this-alias': 'warn',
        },
    },
];
