import { state } from "@granularjs/core";

function Box() {
  const ref = state(null);
  return <div ref={ref}>x</div>;
}
