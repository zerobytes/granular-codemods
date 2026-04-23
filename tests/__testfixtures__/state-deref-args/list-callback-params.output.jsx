import { state, list, resolve } from '@granularjs/core';

export function Page() {
  const todos = state([]);
  return (
    <ul>
      {list(todos, (todo, i) => (
        <li onClick={() => deleteById(resolve(todo.id))}>
          {todo.text}
        </li>
      ))}
    </ul>
  );
}
