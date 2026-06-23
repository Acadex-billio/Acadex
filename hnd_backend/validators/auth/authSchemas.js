const Joi = require('joi');

const passwordSchema = Joi.string().min(8).max(128);
const phoneSchema = Joi.string().trim().pattern(/^[0-9+()\-\s]{7,20}$/);

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const registerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().email().required(),
  phone: phoneSchema.required(),
  password: passwordSchema.required(),
  program: Joi.string().trim().uppercase().valid('HND', 'BTS', 'LECTURER').optional(),
  dpt_id: Joi.string().trim().optional(),
  preferred_language: Joi.string().trim().lowercase().valid('en', 'fr').optional(),
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
