export default function List({ items }) {
  return (
    <ul id="list">
      {items.map((item) => <li key={item.id}>{item.name}</li>)}
    </ul>
  );
}
