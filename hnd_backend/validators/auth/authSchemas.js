const Joi = require('joi');

const passwordSchema = Joi.string().min(8).max(128);
const phoneSchema = Joi.string().trim().pattern(/^[0-9+()\-\s]{7,20}$/);

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
  rememberMe: Joi.alternatives().try(Joi.boolean(), Joi.string().valid('true', 'false')).optional(),
});

const registerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  program: Joi.string().trim().uppercase().valid('HND', 'BTS', 'LECTURER', 'BACHELOR', 'MASTERS', 'LICENCE', 'MASTER').default('HND'),
  dpt_id: Joi.when('program', {
    is: 'LECTURER',
    then: Joi.string().allow('', null).optional(),
    otherwise: Joi.string().hex().length(24).required(),
  }),
  preferred_language: Joi.when('program', {
    is: 'LECTURER',
    then: Joi.string().trim().lowercase().valid('en', 'fr').optional(),
    otherwise: Joi.forbidden(),
  }),
  email: Joi.string().email().required(),
  phone: phoneSchema.required(),
  password: passwordSchema.required(),
});

const resetPasswordRequestSchema = Joi.object({
  email: Joi.string().email().required(),
});

const updatePasswordSchema = Joi.object({
  email: Joi.string().email().required(),
  code: Joi.string().trim().min(4).max(20).required(),
  newPassword: passwordSchema.required(),
});

module.exports = {
  loginSchema,
  registerSchema,
  resetPasswordRequestSchema,
  updatePasswordSchema,
};
