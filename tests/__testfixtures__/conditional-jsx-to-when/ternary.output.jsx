import { signal, when } from "@granularjs/core";

function Toggle() {
  const open = signal(false);
  return (
    <div>
      {when(open, () => <span>open</span>, () => <span>closed</span>)}
    </div>
  );
}
