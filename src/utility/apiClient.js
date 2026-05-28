import axios from 'axios';
import { useCallback, useMemo } from 'react';
import { useLoading } from '../context/LoadingContext';

// custom hook to wrap API calls
export const useApi = () => {
  const { startLoading, stopLoading } = useLoading();

  const request = useCallback(async (config) => {
    const skipLoading = Boolean(config?.skipLoading);
    try {
      if (!skipLoading) startLoading();
      const response = await axios(config);
      return response.data;
    } finally {
      if (!skipLoading) stopLoading();
    }
  }, [startLoading, stopLoading]);

  return useMemo(() => ({ request }), [request]);
};
