import { useRef } from 'react';

function Counter() {
  const counter = useRef(0);
  function inc() {
    counter.current = counter.current + 1;
  }
  return <button onClick={inc}>{counter.current}</button>;
}
