import { signal } from "@granularjs/core";

function Box() {
  const ref = signal(null);
  return <div ref={ref}>x</div>;
}
