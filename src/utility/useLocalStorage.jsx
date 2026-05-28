import { useState } from 'react';

function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? safelyParseJSON(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage for key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;

      // Avoid saving undefined/null as string
      const serialized =
        valueToStore !== undefined && valueToStore !== null
          ? JSON.stringify(valueToStore)
          : '';

      window.localStorage.setItem(key, serialized);
      setStoredValue(valueToStore);
    } catch (error) {
      console.error(`Error setting localStorage for key "${key}":`, error);
    }
  };

  function safelyParseJSON(json) {
    try {
      return JSON.parse(json);
    } catch {
      return json; // fallback for non-JSON primitives
    }
  }

  return [storedValue, setValue];
}

export default useLocalStorage;
