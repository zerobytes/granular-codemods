import { useRef } from 'react';

const App = () => {
  const data = useRef({ x: 1 });
  return <pre>{JSON.stringify(data.current)}</pre>;
};
