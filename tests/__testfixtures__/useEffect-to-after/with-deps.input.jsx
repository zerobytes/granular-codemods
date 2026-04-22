import { useEffect } from 'react';

function Logger({ a, b }) {
  useEffect(() => {
    console.log(a, b);
  }, [a, b]);
  return <div />;
}
