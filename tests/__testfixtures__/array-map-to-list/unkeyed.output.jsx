import { list } from "@granularjs/core";

function Lines({ lines }) {
  return (
    <div>
      {list(lines, (l) => <p>{l}</p>)}
    </div>
  );
}
