import { derive } from "@granularjs/core";

function Sum({ a, b }) {
  const total = derive(() => a + b);
  return <span>{total}</span>;
}
