import { useState } from 'react';

export function ThemeProvider({ children, defaultMode = 'dark' }) {
  const [mode, setMode] = useState(defaultMode);
  const value = { mode, setMode };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
