import { derive } from "@granularjs/core";

const App = () => {
  const heavy = derive(() => compute());
  return <div>{heavy}</div>;
};
