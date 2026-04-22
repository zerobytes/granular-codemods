import { signal } from "@granularjs/core";

const App = () => {
  const data = signal({ x: 1 });
  return <pre>{JSON.stringify(data.get())}</pre>;
};
