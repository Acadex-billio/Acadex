const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const servicePath = path.resolve(__dirname, '../services/camerpayPaymentService.js');

test('CamerPay simulation reports unknown for an unrecognized reference', () => {
  const result = spawnSync(process.execPath, ['-e', `
    require('dotenv').config = () => ({});
    process.env.CAMERPAY_TOKEN = '';
    const service = require(${JSON.stringify(servicePath)});
    service.getCollectionPaymentStatus('not-a-simulation-reference')
      .then((status) => {
        if (status.status !== 'unknown') process.exitCode = 1;
      })
      .catch(() => { process.exitCode = 1; });
  `], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CAMERPAY_ALLOW_SIMULATION: 'true',
      CAMERPAY_TOKEN: '',
      NODE_ENV: 'test',
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('CamerPay simulation cannot start in production', () => {
  const result = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(servicePath)})`], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CAMERPAY_ALLOW_SIMULATION: 'true',
      CAMERPAY_TOKEN: '',
      NODE_ENV: 'production',
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must not be enabled in production/i);
});
