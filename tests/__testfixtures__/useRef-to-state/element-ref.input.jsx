import { useRef } from 'react';

function Box() {
  const ref = useRef(null);
  return <div ref={ref}>x</div>;
}
