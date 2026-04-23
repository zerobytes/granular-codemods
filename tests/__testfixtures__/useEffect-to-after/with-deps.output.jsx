import { after } from "@granularjs/core";

function Logger({ a, b }) {
  after(a, b).change((a, b) => {
    console.log(a, b);
  });
  return <div />;
}
