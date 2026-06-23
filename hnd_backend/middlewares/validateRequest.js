const Joi = require('joi');
const {
  loginSchema,
  registerSchema,
  resetPasswordRequestSchema,
  updatePasswordSchema,
} = require('../validators/auth/authSchemas');
const {
  subscriptionCheckoutSchema,
  manualSubscriptionCheckoutSchema,
  materialCheckoutSchema,
  centerCheckoutSchema,
} = require('../validators/payment/paymentSchemas');

const objectIdSchema = Joi.string().hex().length(24);
const candIdSchema = Joi.string().trim().min(3).max(50);
const phoneSchema = Joi.string().trim().pattern(/^[0-9+()\-\s]{7,20}$/);
const promoCodeSchema = Joi.string().trim().uppercase().pattern(/^[A-Z0-9_-]{3,30}$/);

const validate = ({ body, params, query }) => (req, res, next) => {
  const bodyOptions = { abortEarly: false, stripUnknown: true };
  const routeOptions = { abortEarly: false, allowUnknown: true };

  if (params) {
    const { error, value } = params.validate(req.params, routeOptions);
    if (error) return res.status(400).json({ success: false, message: error.details.map((d) => d.message).join(', ') });
    req.params = value;
  }

  if (query) {
    const { error, value } = query.validate(req.query, routeOptions);
    if (error) return res.status(400).json({ success: false, message: error.details.map((d) => d.message).join(', ') });
    req.query = value;
  }

  if (body) {
    const { error, value } = body.validate(req.body, bodyOptions);
    if (error) return res.status(400).json({ success: false, message: error.details.map((d) => d.message).join(', ') });
    req.body = value;
  }

  return next();
};

const schemas = {
  ids: {
    mongoIdParam: Joi.object({ id: objectIdSchema.required() }),
    roomIdParam: Joi.object({ roomId: objectIdSchema.required() }),
    bookingIdParam: Joi.object({ bookingId: objectIdSchema.required() }),
    transactionIdParam: Joi.object({ transactionId: objectIdSchema.required() }),
    topicIdParam: Joi.object({ topicId: objectIdSchema.required() }),
    inviteIdParam: Joi.object({ inviteId: objectIdSchema.required() }),
    messageIdParam: Joi.object({ messageId: objectIdSchema.required() }),
    codeParam: Joi.object({ code: Joi.string().trim().min(3).max(30).required() }),
    candIdParam: Joi.object({ candId: candIdSchema.required() }),
    lecturerIdParam: Joi.object({ lecturerId: candIdSchema.required() }),
    otherCandIdParam: Joi.object({ otherCandId: candIdSchema.required() }),
  },
  auth: {
    login: loginSchema,
    register: registerSchema,
    resetPasswordRequest: resetPasswordRequestSchema,
    updatePassword: updatePasswordSchema,
  },
  candidate: {
    subscriptionCheckout: subscriptionCheckoutSchema,
    manualSubscriptionCheckout: manualSubscriptionCheckoutSchema,
    materialCheckout: materialCheckoutSchema,
    centerCheckout: centerCheckoutSchema,
  },
  lecturer: {
    createBooking: Joi.object({
      topic: Joi.string().trim().min(3).max(200).required(),
      notes: Joi.string().allow('').max(2000),
      booking_type: Joi.string().trim().valid('tutorship', 'video_conference').default('tutorship'),
      session_mode: Joi.string().trim().valid('video', 'chat').default('video'),
      scheduled_for: Joi.date().iso().required(),
      duration_minutes: Joi.number().integer().min(15).max(480).default(60),
    }),
    bookingPayment: Joi.object({
      phone_number: phoneSchema.optional(),
      phoneNumber: phoneSchema.optional(),
      promoCode: promoCodeSchema.allow('', null).optional(),
      referralCode: promoCodeSchema.allow('', null).optional(),
    }).or('phone_number', 'phoneNumber'),
    updateBookingStatus: Joi.object({
      status: Joi.string().trim().valid('accepted', 'scheduled', 'completed', 'rejected', 'cancelled').required(),
      meeting_link: Joi.string().trim().uri().allow('', null),
    }),
    inviteRespond: Joi.object({ decision: Joi.string().trim().valid('accepted', 'rejected').required() }),
    inviteMany: Joi.object({ invitee_cand_ids: Joi.array().items(candIdSchema).min(1).required() }),
    message: Joi.object({ message: Joi.string().trim().min(1).max(4000).required() }),
  },
  chat: {
    createCenter: Joi.object({
      name: Joi.string().trim().min(3).max(120).required(),
      description: Joi.string().trim().max(500).allow(''),
      paymentTransactionId: objectIdSchema.optional(),
    }),
    joinInvite: Joi.object({ paymentTransactionId: objectIdSchema.optional() }),
    sendMessage: Joi.object({ text: Joi.string().trim().max(4000).allow('') }),
    setMute: Joi.object({ muted: Joi.boolean().required() }),
    react: Joi.object({ reaction: Joi.string().trim().min(1).max(20).required() }),
    querySearch: Joi.object({ q: Joi.string().trim().max(120).required() }),
  },
  admin: {
    manualPaymentApprove: Joi.object({ note: Joi.string().trim().max(500).allow('', null).optional() }),
    manualPaymentReject: Joi.object({ reason: Joi.string().trim().min(3).max(500).required() }),
  },
  developer: {
    userSearch: Joi.object({ q: Joi.string().trim().allow('', null), page: Joi.number().integer().min(1).default(1), limit: Joi.number().integer().min(1).max(100).default(25) }),
    developerAlert: Joi.object({
      subject: Joi.string().trim().min(3).max(250).required(),
      text: Joi.string().trim().min(1).required(),
      title: Joi.string().trim().min(3).optional(),
      body: Joi.string().trim().min(1).optional(),
      url: Joi.string().trim().uri().allow('', null).optional(),
      departments: Joi.array().items(objectIdSchema).optional(),
      emails: Joi.array().items(Joi.string().email()).optional(),
      userIds: Joi.array().items(objectIdSchema).optional(),
      programs: Joi.array().items(Joi.string().trim().uppercase().valid('HND', 'BTS', 'LECTURER', 'ADMINS')).optional(),
      inactivityMonths: Joi.alternatives().try(Joi.number().integer().min(0), Joi.array().items(Joi.number().integer().min(0))).optional(),
    }),
  },
};

module.exports = { validate, schemas };
