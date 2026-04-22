import { after } from "@granularjs/core";

function Logger({ a, b }) {
  after(a, b).change(() => {
    console.log(a, b);
  });
  return <div />;
}
