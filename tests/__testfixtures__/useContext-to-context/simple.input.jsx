import { useContext } from 'react';
import { ThemeCtx } from './ctx';

function Title() {
  const theme = useContext(ThemeCtx);
  return <h1 class={theme}>hi</h1>;
}
