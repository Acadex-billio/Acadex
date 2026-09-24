import { isAdminUser, isDeveloperUser, normalizeRole } from './utility/rolePolicy';

test('normalizes roles consistently', () => {
  expect(normalizeRole('  Developer ')).toBe('developer');
});

test('recognizes administrative role semantics', () => {
  expect(isAdminUser({ role: 'admin' })).toBe(true);
  expect(isAdminUser({ role: 'developer' })).toBe(true);
  expect(isDeveloperUser({ role: 'developer' })).toBe(true);
  expect(isDeveloperUser({ role: 'admin' })).toBe(false);
});
