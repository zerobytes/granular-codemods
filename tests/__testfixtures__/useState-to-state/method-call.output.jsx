import { state } from "@granularjs/core";

export function Form() {
  const task = state('');
  const todos = state([]);

  const submit = () => {
    const text = task.get().trim();
    if (text === '') return;
    todos.get().push(text);
    const filtered = todos.get().filter((t) => t !== '');
    task.set('');
  };

  task.get();
  task.set('reset');
  task.subscribe(() => {});

  return null;
}
