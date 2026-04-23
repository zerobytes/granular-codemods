import { state, list, when } from '@granularjs/core';
import { splitArgs } from '@granularjs/jsx';

export function TodoItem(...args) {
  const { rawProps: { todo, index, total } } = splitArgs(args);
  const editing = state(false);
  const { removeTodo, toggleTodo, moveTodoUp } = useTodos();
  return (
    <ListItem
      title={todo.text}
      onRemove={() => removeTodo(todo.id)}
      onToggle={() => toggleTodo(todo.id)}
      onMoveUp={() => moveTodoUp(todo.id)}
      data-active={editing}
    />
  );
}
