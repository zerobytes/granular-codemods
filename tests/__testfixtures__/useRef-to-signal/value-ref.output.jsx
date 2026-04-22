import { signal } from "@granularjs/core";

function Counter() {
  const counter = signal(0);
  function inc() {
    counter.set(counter.get() + 1);
  }
  return <button onClick={inc}>{counter.get()}</button>;
}
