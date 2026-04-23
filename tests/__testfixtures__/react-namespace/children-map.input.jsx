import React from 'react';

export const List = ({ children }) => (
  <ul>
    {React.Children.map(children, (child, i) => (
      <li key={i}>{child}</li>
    ))}
  </ul>
);

export const total = (children) => React.Children.count(children);
export const arr = (children) => React.Children.toArray(children);
