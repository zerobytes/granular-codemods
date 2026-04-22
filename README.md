# @granularjs/codemods

[jscodeshift](https://github.com/facebook/jscodeshift)-powered codemods that automatically translate React code to [`@granularjs/core`](https://github.com/zerobytes/granular) + [`@granularjs/jsx`](https://github.com/zerobytes/granular-jsx).

These power the `granular migrate` CLI, but you can also run individual transforms standalone via `granular-codemod`.

## Install

```bash
npm install --save-dev @granularjs/codemods
```

## Use the high-level migration CLI

If you have the `granular` CLI (from `@granularjs/core`) installed:

```bash
npx granular migrate ./src
```

This runs every codemod in the right order, plus dependency/config rewrites and a `MIGRATION_REPORT.md`.

## Use individual transforms

```bash
npx granular-codemod useState-to-signal ./src
npx granular-codemod array-map-to-list ./src/components/List.jsx
npx granular-codemod react-imports ./src
```

## Available transforms

### Reactivity

| Transform | What it does |
| --- | --- |
| `useState-to-signal` | `const [x, setX] = useState(0)` → `const x = signal(0)`; rewrites `setX(v)` and `setX(prev => …)`. |
| `useRef-to-signal` | `const ref = useRef(null)` → `const ref = signal(null)`; rewrites `ref.current` reads/writes. |
| `useMemo-to-derive` | `useMemo(() => expr, [deps])` → `derive(() => expr)` (deps inferred reactively). |
| `useEffect-to-after` | `useEffect(fn, [a, b])` → `after(a, b).change(fn)`; empty/missing deps become a one-shot call with a TODO. |
| `useCallback-remove` | `useCallback(fn, deps)` → `fn`. |
| `useContext-to-context` | `useContext(Ctx)` → `Ctx.state()`; flags `<Ctx.Provider>` JSX usages. |
| `setState-updater` | Catch-all for `setX(prev => …)` patterns left over after the previous transforms. |

### Rendering

| Transform | What it does |
| --- | --- |
| `array-map-to-list` | `arr.map(x => <Item …/>)` → `list(arr, x => <Item …/>, { key })`. |
| `conditional-jsx-to-when` | `{cond && <X/>}` and `{cond ? <X/> : <Y/>}` inside JSX → `when(cond, () => <X/>, …)` when `cond` is a known reactive source. Ambiguous cases get a `TODO` comment. |
| `react-imports` | Removes `react` / `react-dom` imports; rewrites `createRoot(el).render(<App/>)` and `ReactDOM.render(<App/>, el)` to `bootstrap(<App/>, el)`. |

### Project config

| Transform | What it does |
| --- | --- |
| `tsconfig` | Sets `compilerOptions.jsx = "react-jsx"` and `compilerOptions.jsxImportSource = "@granularjs/jsx"` in `tsconfig.json`. |
| `vite-config` | Removes `@vitejs/plugin-react`; adds `esbuild.jsx = 'automatic'` and `esbuild.jsxImportSource = '@granularjs/jsx'`. |
| `package-json` | Removes React deps; adds `@granularjs/core` and `@granularjs/jsx`. |

## Programmatic API

```js
const { runTransformOnSource, runAll } = require('@granularjs/codemods/runner');

const out = runTransformOnSource('useState-to-signal', source, { path: 'Counter.jsx' });
```

## License

Apache-2.0
