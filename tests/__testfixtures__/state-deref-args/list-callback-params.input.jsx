import { state, list } from '@granularjs/core';

export function Page() {
  const todos = state([]);
  return (
    <ul>
      {list(todos, (todo, i) => (
        <li onClick={() => deleteById(todo.id)}>
          {todo.text}
        </li>
      ))}
    </ul>
  );
}
