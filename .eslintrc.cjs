module.exports = {
    root: true,
    env: { es2022: true, node: true },
    extends: ['eslint:recommended'],
    ignorePatterns: ['dist/', 'build/', '.cache/', 'resources/', 'out/'],
    overrides: [{
        files: ['**/*.{ts,tsx,mts}'],
        parser: '@typescript-eslint/parser',
        plugins: ['@typescript-eslint'],
        extends: ['plugin:@typescript-eslint/recommended'],
        rules: { '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }] }
    }, {
        files: ['src/renderer/**/*.{ts,tsx}'],
        env: { browser: true, node: false }
    }]
};
