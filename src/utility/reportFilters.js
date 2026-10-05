export const matchesReportSearch = (report, query = '', filterCategory = '') => {
  if (!report) return false;

  const normalizedFilterCategory = String(filterCategory || '').trim().toUpperCase();
  if (normalizedFilterCategory && String(report.report_category || '').trim().toUpperCase() !== normalizedFilterCategory) {
    return false;
  }

  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return true;

  return String(report.title || '').trim().toLowerCase().includes(normalizedQuery);
};
