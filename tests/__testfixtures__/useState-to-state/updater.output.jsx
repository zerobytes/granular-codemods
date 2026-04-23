import { state } from "@granularjs/core";

function Counter() {
  const count = state(0);
  return <button onClick={() => count.set(((c) => c + 1)(count.get()))}>{count}</button>;
}
