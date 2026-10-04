const Joi = require('joi');

const objectIdSchema = Joi.string().hex().length(24);

const departmentsArraySchema = Joi.array()
  .items(objectIdSchema)
  .min(1)
  .max(50)
  .unique();

module.exports = {
  departmentsArraySchema,
};
