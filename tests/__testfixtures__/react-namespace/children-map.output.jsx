import React from 'react';

export const List = ({ children }) => (
  <ul>
    {(children ?? []).map((child, i) => (
      <li key={i}>{child}</li>
    ))}
  </ul>
);

export const total = (children) => (children ?? []).length;
export const arr = (children) => (children ?? []);
