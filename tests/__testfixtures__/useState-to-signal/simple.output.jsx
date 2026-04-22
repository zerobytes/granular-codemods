import { signal } from "@granularjs/core";

function Counter() {
  const count = signal(0);
  return <button onClick={() => count.set(1)}>{count}</button>;
}
