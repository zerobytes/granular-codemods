import { signal } from "@granularjs/core";

function Counter() {
  const count = signal(0);
  return <button onClick={() => count.set(((c) => c + 1)(count.get()))}>{count}</button>;
}
