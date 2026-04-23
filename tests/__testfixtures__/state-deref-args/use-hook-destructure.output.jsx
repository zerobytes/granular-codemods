import { derive, resolve } from '@granularjs/core';
import { useTheme } from './ThemeContext.jsx';

export function AppLayout(outlet) {
  const { mode, toggle } = useTheme();
  const themeIcon = derive(() => (resolve(mode) === 'light' ? 'sun' : 'moon'));

  return (
    <div>
      <button onClick={toggle}>{themeIcon}</button>
      {outlet}
    </div>
  );
}
