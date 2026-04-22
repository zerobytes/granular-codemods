import { list } from "@granularjs/core";

function Items({ items }) {
  return (
    <ul>
      {list(items, (item) => <li>{item.name}</li>, { key: (item) => item.id })}
    </ul>
  );
}
