const Joi = require('joi');

const idempotencyKeySchema = Joi.string().trim().min(8).max(128).pattern(/^[A-Za-z0-9._:-]+$/);
const phoneSchema = Joi.string().trim().pattern(/^[0-9+()\-\s]{7,20}$/);
const promoCodeSchema = Joi.string().trim().uppercase().pattern(/^[A-Z0-9_-]{3,30}$/);
const objectIdSchema = Joi.string().hex().length(24);

const subscriptionCheckoutSchema = Joi.object({
  planCode: Joi.string().trim().valid('pro', 'paygo').required(),
  phoneNumber: phoneSchema.required(),
  paymentMethod: Joi.string().trim().valid('momo', 'mtn_momo', 'orange_money').default('momo'),
  promoCode: promoCodeSchema.allow('', null).optional(),
  referralCode: promoCodeSchema.allow('', null).optional(),
  idempotencyKey: idempotencyKeySchema.optional(),
});

const materialCheckoutSchema = Joi.object({
  resourceType: Joi.string().trim().valid('report', 'presentation', 'question_paper').required(),
  resourceId: objectIdSchema.required(),
  action: Joi.string().trim().valid('preview', 'download').required(),
  phoneNumber: phoneSchema.required(),
  promoCode: promoCodeSchema.allow('', null).optional(),
  referralCode: promoCodeSchema.allow('', null).optional(),
  idempotencyKey: idempotencyKeySchema.optional(),
});

const centerCheckoutSchema = Joi.object({
  action: Joi.string().trim().valid('create', 'join').required(),
  roomId: objectIdSchema.when('action', { is: 'join', then: Joi.required(), otherwise: Joi.optional().allow('', null) }),
  phoneNumber: phoneSchema.required(),
  promoCode: promoCodeSchema.allow('', null).optional(),
  referralCode: promoCodeSchema.allow('', null).optional(),
  idempotencyKey: idempotencyKeySchema.optional(),
});

module.exports = {
  idempotencyKeySchema,
  subscriptionCheckoutSchema,
  materialCheckoutSchema,
  centerCheckoutSchema,
};
