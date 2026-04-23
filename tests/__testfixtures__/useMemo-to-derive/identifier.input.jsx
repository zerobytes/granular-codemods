import { useMemo } from 'react';

const initialFirstRun = () => Date.now();

export function Provider() {
  const firstRun = useMemo(initialFirstRun, []);
  return firstRun;
}
