import React from 'react';

export const TextInput = function TextInput(
  { value, onChange, placeholder, ref },
) {
  return <input ref={ref} value={value} placeholder={placeholder} onChange={onChange} />;
};
