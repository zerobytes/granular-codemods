import { signal, when } from "@granularjs/core";

function Toggle() {
  const open = signal(false);
  return (
    <div>
      {when(open, () => <span>shown</span>)}
    </div>
  );
}
