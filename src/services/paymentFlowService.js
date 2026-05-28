import api from './api';

export const startSubscriptionPayment = async ({ planCode, phoneNumber, paymentMethod = 'momo', promoCode = '', referralCode = '' }) => {
  const { data } = await api.post('/candidate/subscription/checkout', {
    planCode,
    phoneNumber,
    paymentMethod,
    promoCode,
    referralCode,
  });
  return data;
};

export const startManualSubscriptionPayment = async ({ planCode, paymentProof, promoCode = '', referralCode = '' }) => {
  const { data } = await api.post('/candidate/subscription/manual-checkout', {
    planCode,
    paymentProof,
    promoCode,
    referralCode,
  });
  return data;
};

export const startBookingPayment = async ({ bookingId, phoneNumber, promoCode = '', referralCode = '' }) => {
  const { data } = await api.post(`/lecturers/bookings/${encodeURIComponent(bookingId)}/pay`, {
    phone_number: phoneNumber,
    phoneNumber,
    promoCode,
    referralCode,
  });
  return data;
};

export const startInviteAccessPayment = async ({ bookingId, phoneNumber, promoCode = '', referralCode = '' }) => {
  const { data } = await api.post(`/lecturers/bookings/${encodeURIComponent(bookingId)}/video/invites/pay`, {
    phone_number: phoneNumber,
    phoneNumber,
    promoCode,
    referralCode,
  });
  return data;
};
