import React from 'react';

function ErrorMessage({ message }) {
  return <div style={{ color: 'red', margin: '20px 0', border: '1px solid red', padding: '10px' }}>Erreur: {message}</div>;
}

export default ErrorMessage;
