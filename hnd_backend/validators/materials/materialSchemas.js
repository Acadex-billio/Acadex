const Joi = require('joi');

const objectIdSchema = Joi.string().hex().length(24);

const departmentsArraySchema = Joi.array()
  .items(objectIdSchema)
  .min(1)
  .max(50)
  .unique();

const materialPriceSchema = Joi.number().required().min(0).max(1000000).precision(2);

module.exports = {
  departmentsArraySchema,
  materialPriceSchema,
};
