import { useMemo } from 'react';

function Sum({ a, b }) {
  const total = useMemo(() => a + b, [a, b]);
  return <span>{total}</span>;
}
