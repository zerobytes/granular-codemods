import { signal } from "@granularjs/core";

function Toggle() {
  const open = signal(false);
  return (
    <div>
      {open ? <span>open</span> : <span>closed</span>}
    </div>
  );
}
