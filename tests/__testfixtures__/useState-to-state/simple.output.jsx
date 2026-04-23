import { state } from "@granularjs/core";

function Counter() {
  const count = state(0);
  return <button onClick={() => count.set(1)}>{count}</button>;
}
