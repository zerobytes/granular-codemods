import { state } from "@granularjs/core";

const App = () => {
  const data = state({ x: 1 });
  return <pre>{JSON.stringify(data.get())}</pre>;
};
