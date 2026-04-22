import { useMemo } from 'react';

const App = () => {
  const heavy = useMemo(() => compute(), []);
  return <div>{heavy}</div>;
};
