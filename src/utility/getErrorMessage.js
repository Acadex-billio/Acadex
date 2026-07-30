/**
 * Extract user-friendly error message from API/axios errors.
 * Surfaces backend messages to the user instead of generic "Server error".
 * @param {Error} err - Caught error from axios or fetch
 * @param {string} fallback - Message when no specific reason can be extracted
 * @returns {string}
 */
export const getErrorMessage = (err, fallback = 'Something went wrong. Please try again.') => {
  if (!err) return fallback;

  const status = Number(err.response?.status || err.statusCode || 0);
  const msg = err.response?.data?.message ?? err.response?.data?.error ?? err.response?.data?.msg;

  if (status === 400) {
    return msg?.trim() || 'Please review the highlighted fields and try again.';
  }

  if (status === 401) {
    return 'Your Session has Expire, Please Login Again to Get Authenticated';
  }

  if (status === 403) {
    return 'You Don\'t have the permission to perform this action';
  }

  if (status === 404) {
    return 'The requested page was not found.';
  }

  if (status === 500) {
    return 'Something Went Wrong On Our Server, Please try again in a moment';
  }

  if (msg && typeof msg === 'string') return msg.trim();

  if (err.message) {
    if (err.code === 'ECONNABORTED' || status === 408 || status === 504) {
      return 'Connection Timed out. Please check Your internet connection and try again';
    }
    if (err.code === 'ERR_NETWORK') {
      return 'Connection Timed out. Please check Your internet connection and try again';
    }
  }

  return fallback;
};
