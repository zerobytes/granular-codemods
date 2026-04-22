import { signal } from "@granularjs/core";

function Counter() {
  const count = signal(0);
  return <button onClick={() => setCount((c) => c + 1)}>{count}</button>;
}
