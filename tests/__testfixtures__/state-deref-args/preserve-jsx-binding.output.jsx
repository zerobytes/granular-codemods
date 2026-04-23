import { state, when } from '@granularjs/core';

export function NoOp() {
  const count = state(0);
  return (
    <button onClick={() => count.set(count.get() + 1)}>
      {count}
    </button>
  );
}
