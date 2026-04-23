import { forwardRef, memo, Children } from 'react';

const Inner = ({ value }) => <div>{value}</div>;
export const Memoized = memo(Inner);

export const Wrapped = forwardRef(({ value }, ref) => (
  <div ref={ref}>{value}</div>
));

export const total = (children) => Children.count(children);
