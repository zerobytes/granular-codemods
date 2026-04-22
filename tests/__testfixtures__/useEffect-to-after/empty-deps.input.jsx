import { useEffect } from 'react';

function Mount() {
  useEffect(() => {
    init();
  }, []);
  return <div />;
}
