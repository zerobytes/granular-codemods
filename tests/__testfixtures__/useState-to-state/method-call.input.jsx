import { useState } from 'react';

export function Form() {
  const [task, setTask] = useState('');
  const [todos, setTodos] = useState([]);

  const submit = () => {
    const text = task.trim();
    if (text === '') return;
    todos.push(text);
    const filtered = todos.filter((t) => t !== '');
    setTask('');
  };

  task.get();
  task.set('reset');
  task.subscribe(() => {});

  return null;
}
