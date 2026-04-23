import { state } from "@granularjs/core";

export function ThemeProvider({ children, defaultMode = 'dark' }) {
  const mode = state(defaultMode);
  const value = { mode, setMode: mode.set };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
