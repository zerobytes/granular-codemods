import React from 'react';

export const TextInput = React.forwardRef(function TextInput(
  { value, onChange, placeholder, ...rest },
  ref,
) {
  return <input ref={ref} value={value} placeholder={placeholder} onChange={onChange} {...rest} />;
});
