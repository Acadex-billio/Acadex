import React, { useEffect, useMemo, useState } from 'react';
import styles from '../Astyles/departmentMultiSelect.module.css';

const getDepartmentId = (department) => String(department?.dpt_id || department?._id || '');
const getDepartmentName = (department) => String(department?.department_name || department?.dpt_name || '');

const DepartmentMultiSelect = ({ departments, selectedIds, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [draftIds, setDraftIds] = useState([]);

  const selectedDepartments = useMemo(() => {
    const selected = new Set((selectedIds || []).map(String));
    return departments.filter((department) => selected.has(getDepartmentId(department)));
  }, [departments, selectedIds]);
  const selectedCount = (selectedIds || []).length;

  const filteredDepartments = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...departments]
      .filter((department) => getDepartmentName(department).toLowerCase().includes(query))
      .sort((left, right) => getDepartmentName(left).localeCompare(getDepartmentName(right)));
  }, [departments, search]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const openPicker = () => {
    setDraftIds((selectedIds || []).map(String));
    setSearch('');
    setIsOpen(true);
  };

  const toggleDepartment = (departmentId) => {
    setDraftIds((current) => (
      current.includes(departmentId)
        ? current.filter((id) => id !== departmentId)
        : [...current, departmentId]
    ));
  };

  const applySelection = () => {
    onChange(draftIds);
    setIsOpen(false);
  };

  return (
    <>
      <button type="button" className={styles.trigger} onClick={openPicker}>
        <span>{selectedCount ? 'Change departments' : 'Choose departments'}</span>
        <span className={styles.count}>
          {selectedCount} selected
        </span>
      </button>
      {selectedCount > 0 && selectedDepartments.length > 0 && (
        <p className={styles.summary}>
          {selectedDepartments.map(getDepartmentName).join(', ')}
        </p>
      )}

      {isOpen && (
        <div
          className={styles.overlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false);
          }}
        >
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="department-picker-title"
          >
            <header className={styles.header}>
              <div>
                <h2 id="department-picker-title" className={styles.title}>Choose departments</h2>
                <p className={styles.selectedCount} aria-live="polite">
                  {draftIds.length} department{draftIds.length === 1 ? '' : 's'} selected
                </p>
              </div>
              <button
                type="button"
                className={styles.closeButton}
                onClick={() => setIsOpen(false)}
                aria-label="Close department selector"
              >
                Close
              </button>
            </header>

            <label className={styles.searchLabel} htmlFor="department-picker-search">
              Search departments
            </label>
            <input
              id="department-picker-search"
              className={styles.search}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Type a department name"
              autoFocus
            />

            <div className={styles.list} aria-label="Departments">
              {filteredDepartments.length ? filteredDepartments.map((department) => {
                const id = getDepartmentId(department);
                const isSelected = draftIds.includes(id);
                return (
                  <label key={id} className={styles.department}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleDepartment(id)}
                    />
                    <span>{getDepartmentName(department)}</span>
                  </label>
                );
              }) : (
                <p className={styles.empty}>
                  {departments.length ? 'No departments match your search.' : 'No departments are available for this program.'}
                </p>
              )}
            </div>

            <footer className={styles.footer}>
              <button type="button" className={styles.cancelButton} onClick={() => setIsOpen(false)}>
                Cancel
              </button>
              <button type="button" className={styles.doneButton} onClick={applySelection}>
                Done
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
};

export default DepartmentMultiSelect;
