import { signal } from "@granularjs/core";

function Toggle() {
  const open = signal(false);
  return (
    <div>
      {open && <span>shown</span>}
    </div>
  );
}
