const Joi = require('joi');

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
    login: Joi.object({ email: Joi.string().email().required(), password: Joi.string().min(8).required() }),
    register: Joi.object({
      name: Joi.string().trim().min(2).max(100).required(),
      program: Joi.string().trim().uppercase().valid('HND', 'BTS', 'LECTURER').default('HND'),
      dpt_id: Joi.when('program', {
        is: 'LECTURER',
        then: Joi.string().allow('', null).optional(),
        otherwise: objectIdSchema.required(),
      }),
      preferred_language: Joi.when('program', {
        is: 'LECTURER',
        then: Joi.string().trim().lowercase().valid('en', 'fr').optional(),
        otherwise: Joi.forbidden(),
      }),
      email: Joi.string().email().required(),
      phone: phoneSchema.required(),
      password: Joi.string().min(8).required(),
    }),
  },
  candidate: {
    subscriptionCheckout: Joi.object({
      planCode: Joi.string().trim().valid('pro', 'paygo').required(),
      phoneNumber: phoneSchema.required(),
      paymentMethod: Joi.string().trim().valid('momo', 'orange_money').default('momo'),
      promoCode: promoCodeSchema.allow('', null).optional(),
      referralCode: promoCodeSchema.allow('', null).optional(),
    }),
    manualSubscriptionCheckout: Joi.object({
      planCode: Joi.string().trim().valid('pro', 'paygo').required(),
      paymentProof: Joi.string().trim().min(6).max(500).required(),
      promoCode: promoCodeSchema.allow('', null).optional(),
      referralCode: promoCodeSchema.allow('', null).optional(),
    }),
    materialCheckout: Joi.object({
      resourceType: Joi.string().trim().valid('report', 'presentation', 'question_paper').required(),
      resourceId: objectIdSchema.required(),
      action: Joi.string().trim().valid('preview', 'download').required(),
      phoneNumber: phoneSchema.required(),
      promoCode: promoCodeSchema.allow('', null).optional(),
      referralCode: promoCodeSchema.allow('', null).optional(),
    }),
    centerCheckout: Joi.object({
      action: Joi.string().trim().valid('create', 'join').required(),
      roomId: objectIdSchema.when('action', { is: 'join', then: Joi.required(), otherwise: Joi.optional().allow('', null) }),
      phoneNumber: phoneSchema.required(),
      promoCode: promoCodeSchema.allow('', null).optional(),
      referralCode: promoCodeSchema.allow('', null).optional(),
    }),
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
};

module.exports = { validate, schemas };
