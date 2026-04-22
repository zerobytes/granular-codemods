import { signal } from "@granularjs/core";

function Form() {
  const name = signal('');
  const age = signal(0);
  return (
    <div>
      <input value={name} onInput={(e) => name.set(e.target.value)} />
      <input value={age} onInput={(e) => age.set(Number(e.target.value))} />
    </div>
  );
}
