import { state, derive, when } from '@granularjs/core';

export function ThemeIcon() {
  const mode = state('dark');
  const themeIcon = derive(() => (mode === 'light' ? 'brightness_5' : 'dark_mode'));
  return <Icon>{themeIcon}</Icon>;
}
