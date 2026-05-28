/**
 * Extract user-friendly error message from API/axios errors.
 * Surfaces backend messages to the user instead of generic "Server error".
 * @param {Error} err - Caught error from axios or fetch
 * @param {string} fallback - Message when no specific reason can be extracted
 * @returns {string}
 */
export const getErrorMessage = (err, fallback = 'Something went wrong. Please try again.') => {
  if (!err) return fallback;
  const msg = err.response?.data?.message ?? err.response?.data?.error ?? err.response?.data?.msg;
  if (msg && typeof msg === 'string') return msg.trim();
  if (err.message) {
    if (err.code === 'ECONNABORTED') return 'Request timed out. Please try again.';
    if (err.code === 'ERR_NETWORK') return 'Cannot connect to server. Check your connection and that the backend is running.';
  }
  return fallback;
};
