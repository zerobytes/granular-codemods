import { state } from "@granularjs/core";

function Form() {
  const text = state('');
  return <Input value={text} onChange={text.set} onSubmit={() => save(text.set)} />;
}
