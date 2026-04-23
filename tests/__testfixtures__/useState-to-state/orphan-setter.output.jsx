import { state } from "@granularjs/core";

export function ThemeProvider({ children, defaultMode = 'dark' }) {
  const mode = state(defaultMode);
  const value = { mode, setMode: v => mode.set(v) };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
