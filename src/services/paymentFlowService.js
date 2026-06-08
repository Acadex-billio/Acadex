import api from './api';

export const startSubscriptionPayment = async ({ planCode, phoneNumber, paymentMethod = 'momo', promoCode = '', referralCode = '', redirectUrl = `${window.location.origin}/payment/confirmation` }) => {
  const { data } = await api.post('/candidate/subscription/checkout', {
    planCode,
    phoneNumber,
    paymentMethod,
    promoCode,
    referralCode,
    redirectUrl,
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
