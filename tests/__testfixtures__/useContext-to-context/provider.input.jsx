import { createContext, useContext } from 'react';

const ThemeCtx = createContext({ mode: 'light' });

export function ThemeProvider({ children, value }) {
  return (
    <ThemeCtx.Provider value={value}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
