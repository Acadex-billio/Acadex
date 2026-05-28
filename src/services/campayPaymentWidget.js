// CampAy Payment Widget Integration
// Reference: https://demo.campay.net/docs/integration

let campayScriptLoaded = false;

export const initializeCampayWidget = () => {
  if (campayScriptLoaded) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const apiId = process.env.REACT_APP_CAMPAY_API_ID || '';

    if (!apiId) {
      console.warn('CampAy API ID not configured in environment variables');
      reject(new Error('CampAy API ID not configured'));
      return;
    }

    script.src = `https://demo.campay.net/sdk/js?app-id=${apiId}`;
    script.async = true;
    script.onload = () => {
      campayScriptLoaded = true;
      if (window.campay) {
        resolve(window.campay);
      } else {
        reject(new Error('CampAy SDK failed to load'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load CampAy SDK'));

    document.head.appendChild(script);
  });
};

export const configureCampayPayment = ({
  amount,
  description,
  currency = 'XAF',
  externalReference,
  redirectUrl,
}) => {
  if (!window.campay) {
    throw new Error('CampAy SDK not loaded');
  }

  window.campay.options({
    payButtonId: 'campay-pay-button',
    description: description || 'Payment',
    amount: Number(amount),
    currency,
    externalReference: externalReference || '',
    ...(redirectUrl ? { redirectUrl } : {}),
  });
};

export const setupCampayCallbacks = ({ onSuccess, onFail, onModalClose }) => {
  if (!window.campay) {
    console.warn('CampAy SDK not loaded for callback setup');
    return;
  }

  window.campay.onSuccess = function (data) {
    console.log('CampAy Payment Success:', data);
    if (onSuccess) {
      onSuccess({
        status: data.status,
        reference: data.reference,
      });
    }
  };

  window.campay.onFail = function (data) {
    console.log('CampAy Payment Failed:', data);
    if (onFail) {
      onFail({
        status: data.status,
        reference: data.reference,
      });
    }
  };

  window.campay.onModalClose = function (data) {
    console.log('CampAy Modal Closed:', data);
    if (onModalClose) {
      onModalClose({
        status: data.status,
      });
    }
  };
};

export const triggerCampayPayment = () => {
  if (!window.campay) {
    throw new Error('CampAy SDK not loaded');
  }

  // The CampAy SDK typically triggers payment through a button click
  // or direct method call. Check documentation for latest API.
  if (typeof window.campay.triggerPayment === 'function') {
    window.campay.triggerPayment();
  } else {
    // Fallback: look for pay button and click it
    const payButton = document.getElementById('campay-pay-button');
    if (payButton) {
      payButton.click();
    }
  }
};

export default {
  initializeCampayWidget,
  configureCampayPayment,
  setupCampayCallbacks,
  triggerCampayPayment,
};
