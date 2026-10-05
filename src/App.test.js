import { isAdminUser, isDeveloperUser, normalizeRole } from './utility/rolePolicy';
import { matchesReportSearch } from './utility/reportFilters';

test('normalizes roles consistently', () => {
  expect(normalizeRole('  Developer ')).toBe('developer');
});

test('recognizes administrative role semantics', () => {
  expect(isAdminUser({ role: 'admin' })).toBe(true);
  expect(isAdminUser({ role: 'developer' })).toBe(true);
  expect(isDeveloperUser({ role: 'developer' })).toBe(true);
  expect(isDeveloperUser({ role: 'admin' })).toBe(false);
});

test('ignores missing report titles when filtering by search', () => {
  expect(matchesReportSearch({ title: undefined }, 'network')).toBe(false);
  expect(matchesReportSearch({ title: 'Digital Systems' }, 'systems')).toBe(true);
  expect(matchesReportSearch({ title: undefined }, '')).toBe(true);
});
