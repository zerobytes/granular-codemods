import React from 'react';

export const TextInput = function TextInput(
  { value, onChange, placeholder, ref, ...rest },
) {
  return <input ref={ref} value={value} placeholder={placeholder} onChange={onChange} {...rest} />;
};
