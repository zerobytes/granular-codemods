import { state } from "@granularjs/core";

function Box({ defaultMode = 'dark' }) {
  const mode = state((() => {
    try {
      return localStorage.getItem('themeMode') || defaultMode;
    } catch {
      return defaultMode;
    }
  })());
  return <div>{mode}</div>;
}
