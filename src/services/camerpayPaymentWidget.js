// CamerPay Payment Widget Integration
// Reference: https://demo.camerpay.biz/docs/integration

let camerpayScriptLoaded = false;

export const initializeCamerpayWidget = () => {
  if (camerpayScriptLoaded) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const apiId = process.env.REACT_APP_CAMERPAY_API_ID || '';

    if (!apiId) {
      console.warn('CamerPay API ID not configured in environment variables');
      reject(new Error('CamerPay API ID not configured'));
      return;
    }

    script.src = `https://demo.camerpay.biz/sdk/js?app-id=${apiId}`;
    script.async = true;
    script.onload = () => {
      camerpayScriptLoaded = true;
      if (window.camerpay) {
        resolve(window.camerpay);
      } else {
        reject(new Error('CamerPay SDK failed to load'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load CamerPay SDK'));

    document.head.appendChild(script);
  });
};

export const configureCamerpayPayment = ({
  amount,
  description,
  currency = 'XAF',
  externalReference,
  redirectUrl,
}) => {
  if (!window.camerpay) {
    throw new Error('CamerPay SDK not loaded');
  }

  window.camerpay.options({
    payButtonId: 'camerpay-pay-button',
    description: description || 'Payment',
    amount: Number(amount),
    currency,
    externalReference: externalReference || '',
    ...(redirectUrl ? { redirectUrl } : {}),
  });
};

export const setupCamerpayCallbacks = ({ onSuccess, onFail, onModalClose }) => {
  if (!window.camerpay) {
    console.warn('CamerPay SDK not loaded for callback setup');
    return;
  }

  window.camerpay.onSuccess = function (data) {
    console.log('CamerPay Payment Success:', data);
    if (onSuccess) {
      onSuccess({
        status: data.status,
        reference: data.reference,
      });
    }
  };

  window.camerpay.onFail = function (data) {
    console.log('CamerPay Payment Failed:', data);
    if (onFail) {
      onFail({
        status: data.status,
        reference: data.reference,
      });
    }
  };

  window.camerpay.onModalClose = function (data) {
    console.log('CamerPay Modal Closed:', data);
    if (onModalClose) {
      onModalClose({
        status: data.status,
      });
    }
  };
};

export const triggerCamerpayPayment = () => {
  if (!window.camerpay) {
    throw new Error('CamerPay SDK not loaded');
  }

  // The CamerPay SDK typically triggers payment through a button click
  // or direct method call. Check documentation for latest API.
  if (typeof window.camerpay.triggerPayment === 'function') {
    window.camerpay.triggerPayment();
  } else {
    // Fallback: look for pay button and click it
    const payButton = document.getElementById('camerpay-pay-button');
    if (payButton) {
      payButton.click();
    }
  }
};

export default {
  initializeCamerpayWidget,
  configureCamerpayPayment,
  setupCamerpayCallbacks,
  triggerCamerpayPayment,
};
