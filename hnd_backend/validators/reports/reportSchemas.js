const Joi = require('joi');
const { materialPriceSchema } = require('../materials/materialSchemas');

const githubUrlPattern = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/.*)?$/;

const projectGithubUrlSchema = Joi.string()
  .trim()
  .pattern(githubUrlPattern)
  .allow('', null)
  .messages({
    'string.pattern.base': 'project_github_url must be a valid GitHub repository URL',
  });

const reportMaterialFieldsSchema = Joi.object({
  material_price: materialPriceSchema.optional(),
  project_github_url: projectGithubUrlSchema.optional(),
});

module.exports = {
  projectGithubUrlSchema,
  reportMaterialFieldsSchema,
};
