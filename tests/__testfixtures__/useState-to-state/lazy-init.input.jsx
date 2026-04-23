import { useState } from 'react';

function Box({ defaultMode = 'dark' }) {
  const [mode, setMode] = useState(() => {
    try {
      return localStorage.getItem('themeMode') || defaultMode;
    } catch {
      return defaultMode;
    }
  });
  return <div>{mode}</div>;
}
