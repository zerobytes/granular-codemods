import { state, list, when, resolve } from '@granularjs/core';
import { splitArgs } from '@granularjs/jsx';

export function TodoItem(...args) {
  const { rawProps: { todo, index, total } } = splitArgs(args);
  const editing = state(false);
  const { removeTodo, toggleTodo, moveTodoUp } = useTodos();
  return (
    <ListItem
      title={todo.text}
      onRemove={() => removeTodo(resolve(todo.id))}
      onToggle={() => toggleTodo(resolve(todo.id))}
      onMoveUp={() => moveTodoUp(resolve(todo.id))}
      data-active={editing}
    />
  );
}
