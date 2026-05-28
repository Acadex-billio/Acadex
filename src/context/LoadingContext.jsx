import React, { createContext, useContext, useState, useCallback } from 'react';

const LoadingContext = createContext();

export const LoadingProvider = ({ children }) => {
  const [pendingCount, setPendingCount] = useState(0);
  const startLoading = useCallback(() => setPendingCount((n) => n + 1), []);
  const stopLoading = useCallback(() => setPendingCount((n) => (n > 0 ? n - 1 : 0)), []);
  const loading = pendingCount > 0;

  return (
    <LoadingContext.Provider value={{ loading, startLoading, stopLoading }}>
      {children}
    </LoadingContext.Provider>
  );
};

export const useLoading = () => useContext(LoadingContext);
