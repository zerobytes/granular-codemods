import { state } from "@granularjs/core";

function Form() {
  const text = state('');
  return <Input value={text} onChange={v => text.set(v)} onSubmit={() => save(v => text.set(v))} />;
}
