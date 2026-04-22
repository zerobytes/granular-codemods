import { useState } from 'react';

function Form() {
  const [name, setName] = useState('');
  const [age, setAge] = useState(0);
  return (
    <div>
      <input value={name} onInput={(e) => setName(e.target.value)} />
      <input value={age} onInput={(e) => setAge(Number(e.target.value))} />
    </div>
  );
}
