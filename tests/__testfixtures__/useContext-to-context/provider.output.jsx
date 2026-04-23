import { context } from "@granularjs/core";

const ThemeCtx = context({ mode: 'light' });

export function ThemeProvider({ children, value }) {
  return (ThemeCtx.scope(value).serve(children));
}

export const useTheme = () => ThemeCtx.state().get();
