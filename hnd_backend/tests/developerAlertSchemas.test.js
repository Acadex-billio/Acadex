const assert = require('node:assert/strict');
const test = require('node:test');
const { schemas } = require('../middlewares/validateRequest');

test('push alert schema accepts push fields without requiring email fields', () => {
  const { error } = schemas.developer.developerPushAlert.validate({
    title: 'Platform notice',
    body: 'New materials are available',
    url: '/materials',
  });

  assert.equal(error, undefined);
});

test('push alert schema rejects unsafe notification URLs', () => {
  const { error } = schemas.developer.developerPushAlert.validate({
    title: 'Platform notice',
    body: 'New materials are available',
    url: 'javascript:alert(1)',
  });

  assert.ok(error);
});

test('email alert schema still requires a subject and message', () => {
  const { error } = schemas.developer.developerEmailAlert.validate({
    subject: 'Platform update',
    text: 'There is a new platform update',
  });

  assert.equal(error, undefined);
});
