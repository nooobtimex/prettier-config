import { createRequire } from 'node:module';
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';

// eslint-config-next sets `react.version: 'detect'`, and eslint-plugin-react 7.37
// detects by calling `context.getFilename()` — removed in ESLint 10, so every file
// crashes with "contextOrFilename.getFilename is not a function". Reading the
// installed version here is the same answer without that code path. Drop this
// once eslint-plugin-react ships ESLint 10 support.
const { version: reactVersion } = createRequire(import.meta.url)('react/package.json');

const eslintConfig = defineConfig([
	...nextVitals,
	...nextTs,
	prettier,
	{
		settings: {
			react: { version: reactVersion },
		},
		plugins: {
			prettier: prettierPlugin,
		},
		rules: {
			'prettier/prettier': 'error',
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
				},
			],
			'no-console': ['warn', { allow: ['warn', 'error'] }],
		},
	},
	// Override default ignores of eslint-config-next.
	globalIgnores([
		// repo-kit core — stamped, edited only in the repo-kit repo
		'.claude/skills/update-docs/**',
		// Default ignores of eslint-config-next:
		'.next/**',
		'out/**',
		'build/**',
		'next-env.d.ts',
	]),
]);

export default eslintConfig;
