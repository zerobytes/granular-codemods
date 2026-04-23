import { state } from "@granularjs/core";

function Form() {
  const name = state('');
  const age = state(0);
  return (
    <div>
      <input value={name} onInput={(e) => name.set(e.target.value)} />
      <input value={age} onInput={(e) => age.set(Number(e.target.value))} />
    </div>
  );
}
