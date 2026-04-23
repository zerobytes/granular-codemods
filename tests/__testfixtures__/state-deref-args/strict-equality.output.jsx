import { state, derive, when, resolve } from '@granularjs/core';

export function ThemeIcon() {
  const mode = state('dark');
  const themeIcon = derive(() => (resolve(mode) === 'light' ? 'brightness_5' : 'dark_mode'));
  return <Icon>{themeIcon}</Icon>;
}
