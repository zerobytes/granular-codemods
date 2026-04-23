import { derive } from "@granularjs/core";

const initialFirstRun = () => Date.now();

export function Provider() {
  const firstRun = derive(() => initialFirstRun());
  return firstRun;
}
