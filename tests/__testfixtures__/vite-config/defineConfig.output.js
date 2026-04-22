import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [],
  esbuild: { jsx: 'automatic', jsxImportSource: '@granularjs/jsx' },
});
