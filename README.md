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
# Basic: writes the migrated copy to "<source>-granular" next to your source
npx granular migrate ./my-react-app

# Explicit output path
npx granular migrate ./my-react-app --out ./my-granular-app

# Preview only (no files touched, no destination created)
npx granular migrate ./my-react-app --dry-run

# Overwrite an existing destination
npx granular migrate ./my-react-app --out ./out --force
```

The migration is **always non-destructive**: the source folder is never
modified. The CLI clones the project to the destination first (skipping
`node_modules`, `dist`, build caches, etc.) and runs every codemod plus
dependency/config rewrites against the **clone**. A `MIGRATION_REPORT.md`
is written to the destination, with `diff` instructions to compare against
the source.

Steps the migration runs (use `--steps` / `--skip` to control them):
`discover, clone, deps, config, codemods, lint, audit, report`.

## Use individual transforms

```bash
npx granular-codemod useState-to-state ./src
npx granular-codemod array-map-to-list ./src/components/List.jsx
npx granular-codemod react-imports ./src
```

## Available transforms

### Reactivity

| Transform | What it does |
| --- | --- |
| `useState-to-state` | `const [x, setX] = useState(0)` → `const x = state(0)`; rewrites `setX(v)` and `setX(prev => …)`. Surviving shorthand references to the setter (e.g. `{x, setX}`) are expanded to `{x, setX: x.set}`. |
| `useRef-to-state` | `const ref = useRef(null)` → `const ref = state(null)`; rewrites `ref.current` reads/writes. |
| `useMemo-to-derive` | `useMemo(() => expr, [deps])` → `derive(() => expr)` (deps inferred reactively). |
| `useEffect-to-after` | `useEffect(fn, [a, b])` → `after(a, b).change((a, b) => fn(...))`. When deps are simple identifiers and the callback has no params, the dep names are bound as the callback parameters so the body keeps using each dep as a plain value. Empty/missing deps become a one-shot call with a TODO. |
| `useCallback-remove` | `useCallback(fn, deps)` → `fn`. |
| `useContext-to-context` | `createContext(default)` → `context(default)`; `useContext(Ctx)` → `Ctx.state()`; `<Ctx.Provider value={x}>{children}</Ctx.Provider>` → `Ctx.scope(x).serve(children)`. |
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

const out = runTransformOnSource('useState-to-state', source, { path: 'Counter.jsx' });
```

## License

Apache-2.0
