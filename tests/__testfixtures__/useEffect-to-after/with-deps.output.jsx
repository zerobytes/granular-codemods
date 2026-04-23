import { after } from "@granularjs/core";

function Logger({ a, b }) {
  after(a, b).effect((a, b) => {
    console.log(a, b);
  });
  return <div />;
}
