import { ThemeCtx } from './ctx';

function Title() {
  const theme = ThemeCtx.state();
  return <h1 class={theme}>hi</h1>;
}
