import { state, after } from '@granularjs/core';

export function ThemeProvider() {
  const mode = state('dark');

  // After useEffect-to-after rewrites useEffect(fn, [mode]) the codemod
  // rebinds the callback param to the same name as the dep. Inside the
  // callback `mode` refers to the param (a primitive), NOT the outer state
  // proxy — we must NOT add `.get()` here.
  after(mode).effect(mode => {
    document.documentElement.setAttribute('data-theme', mode);
  });

  // Also proves we don't unwrap shadowed names when used as call args.
  const consume = (mode) => doSomething(mode);

  return mode;
}
