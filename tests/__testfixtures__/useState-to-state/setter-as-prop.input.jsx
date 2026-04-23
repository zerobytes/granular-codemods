import { useState } from 'react';

function Form() {
  const [text, setText] = useState('');
  return <Input value={text} onChange={setText} onSubmit={() => save(setText)} />;
}
