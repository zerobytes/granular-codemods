import Counter from './Counter.jsx';
import List from './List.jsx';

export default function App() {
  const items = [
    { id: 1, name: 'alpha' },
    { id: 2, name: 'beta' },
    { id: 3, name: 'gamma' },
  ];
  return (
    <div id="app">
      <Counter />
      <List items={items} />
    </div>
  );
}
