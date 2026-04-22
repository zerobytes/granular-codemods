import { useCallback } from 'react';

function Btn({ x }) {
  const onClick = useCallback(() => doIt(x), [x]);
  return <button onClick={onClick}>go</button>;
}
