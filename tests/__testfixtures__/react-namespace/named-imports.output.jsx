const Inner = ({ value }) => <div>{value}</div>;
export const Memoized = Inner;

export const Wrapped = ({ value, ref }) => (
  <div ref={ref}>{value}</div>
);

export const total = (children) => (children ?? []).length;
