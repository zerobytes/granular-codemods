function Btn({ x }) {
  const onClick = () => doIt(x);
  return <button onClick={onClick}>go</button>;
}
