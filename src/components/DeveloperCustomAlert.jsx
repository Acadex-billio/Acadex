import React, { useEffect, useState } from 'react';
import api from '../services/api';
import styles from '../Astyles/developerCustomAlert.module.css';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';

const PROGRAMS = ['HND', 'BTS', 'LECTURER', 'ADMINS'];

const ConfirmationModal = ({ isOpen, title, message, recipientCount, onConfirm, onCancel, loading }) => {
  if (!isOpen) return null;

  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>{title}</h3>
        <p className={styles.modalMessage}>{message}</p>
        {recipientCount > 0 && (
          <div className={styles.recipientInfo}>
            📊 Recipients: <strong>{recipientCount}</strong>
          </div>
        )}
        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button className={styles.confirmBtn} onClick={onConfirm} disabled={loading}>
            {loading ? (
              <>
                <span className={styles.spinner} /> Sending...
              </>
            ) : (
              'Confirm & Send'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

const DeveloperCustomAlert = () => {
  const [recipientType, setRecipientType] = useState('filter');
  const [q, setQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [filteredDepartments, setFilteredDepartments] = useState([]);
  const [deptSearchQ, setDeptSearchQ] = useState('');
  const [selectedDepartments, setSelectedDepartments] = useState([]);
  const [selectedPrograms, setSelectedPrograms] = useState([]);

  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');

  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [deptsLoading, setDeptsLoading] = useState(true);

  const [confirmModal, setConfirmModal] = useState({ isOpen: false, type: null, recipientCount: 0 });

  // Load departments
  useEffect(() => {
    let cancelled = false;
    const loadDepartments = async () => {
      try {
        const res = await api.get('/admin/departments');
        if (cancelled) return;
        // Backend returns array directly, not wrapped in {departments: [...]}
        const depts = Array.isArray(res.data) ? res.data : [];
        setDepartments(depts);
        setFilteredDepartments(depts.slice(0, 5)); // Show first 5
      } catch (err) {
        showToast(getErrorMessage(err, 'Failed to load departments'), 'error');
        setDepartments([]);
        setFilteredDepartments([]);
      } finally {
        setDeptsLoading(false);
      }
    };
    loadDepartments();
    return () => { cancelled = true; };
  }, []);

  // Search users
  const searchUsers = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!q.trim()) {
      showToast('Please enter a search term', 'warning');
      return;
    }

    setSearching(true);
    try {
      const { data } = await api.get('/developer/users', { params: { q: q.trim(), limit: 50 } });
      const users = Array.isArray(data?.users) ? data.users : [];
      setSearchResults(users);
      if (users.length === 0) {
        showToast('No users found', 'info');
      } else {
        showToast(`Found ${users.length} user(s)`, 'success');
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'Search failed'), 'error');
    } finally {
      setSearching(false);
    }
  };

  // Search departments
  const searchDepartments = () => {
    if (!deptSearchQ.trim()) {
      // Show first 5 if search cleared
      setFilteredDepartments(departments.slice(0, 5));
      return;
    }

    const query = deptSearchQ.trim().toLowerCase();
    const filtered = departments.filter(
      (d) =>
        d.department_name.toLowerCase().includes(query) ||
        d.abbreviation.toLowerCase().includes(query)
    );
    setFilteredDepartments(filtered);
    if (filtered.length === 0) {
      showToast('No departments found', 'info');
    } else {
      showToast(`Found ${filtered.length} department(s)`, 'success');
    }
  };

  // Toggle user selection
  const toggleSelectUser = (user) => {
    if (selectedUsers.find((u) => u._id === user._id)) {
      setSelectedUsers(selectedUsers.filter((u) => u._id !== user._id));
    } else {
      setSelectedUsers([...selectedUsers, user]);
    }
  };

  // Select all / Deselect all
  const selectAllUsers = () => {
    setSelectedUsers(searchResults);
  };

  const deselectAllUsers = () => {
    setSelectedUsers([]);
  };

  // Toggle department
  const toggleDept = (id) => {
    setSelectedDepartments((prev) => 
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  // Toggle program
  const toggleProgram = (p) => {
    setSelectedPrograms((prev) => 
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  // Select all departments
  const selectAllDepts = () => {
    setSelectedDepartments(filteredDepartments.map((d) => d.dpt_id));
  };

  // Deselect all departments
  const deselectAllDepts = () => {
    setSelectedDepartments([]);
  };

  // Select all programs
  const selectAllPrograms = () => {
    setSelectedPrograms([...PROGRAMS]);
  };

  // Deselect all programs
  const deselectAllPrograms = () => {
    setSelectedPrograms([]);
  };

  // Validate email form
  const canSendEmail = subject.trim() && text.trim() && 
    (recipientType === 'specific' ? selectedUsers.length > 0 : true);

  // Validate push form
  const canSendPush = title.trim() && body.trim() && 
    (recipientType === 'specific' ? selectedUsers.length > 0 : true);

  // Open confirmation modal for email
  const initiateEmailSend = () => {
    if (!canSendEmail) {
      showToast('Please fill all required fields', 'warning');
      return;
    }
    const recipientCount = recipientType === 'specific' ? selectedUsers.length : 0;
    setConfirmModal({ isOpen: true, type: 'email', recipientCount });
  };

  // Open confirmation modal for push
  const initiatePushSend = () => {
    if (!canSendPush) {
      showToast('Please fill all required fields', 'warning');
      return;
    }
    const recipientCount = recipientType === 'specific' ? selectedUsers.length : 0;
    setConfirmModal({ isOpen: true, type: 'push', recipientCount });
  };

  // Send email
  const sendEmail = async () => {
    setLoading(true);
    try {
      const payload = { subject, text };
      if (recipientType === 'specific' && selectedUsers.length) {
        payload.userIds = selectedUsers.map((u) => u._id);
      } else {
        if (selectedDepartments.length) payload.departments = selectedDepartments;
        if (selectedPrograms.length) payload.programs = selectedPrograms;
      }

      const res = await api.post('/developer/alerts/email', payload);
      const attempted = res.data?.attempted || 0;
      const sent = res.data?.result?.sent || 0;
      const failed = res.data?.result?.failed || 0;
      
      showToast(`${failed ? 'Email partially accepted' : 'Email batches accepted'}: Selected ${attempted}, accepted ${sent}, failed ${failed}. Delivery may take time.`, failed ? 'warning' : 'success');
      
      // Reset form
      setSubject('');
      setText('');
      setSelectedUsers([]);
      setSelectedDepartments([]);
      setSelectedPrograms([]);
      setConfirmModal({ isOpen: false, type: null, recipientCount: 0 });
    } catch (err) {
      const partialResult = err?.response?.data;
      if (partialResult?.result && partialResult.failed > 0) {
        showToast(`Email partially accepted: Selected ${partialResult.attempted || 0}, accepted ${partialResult.accepted || 0}, failed ${partialResult.failed}.`, 'warning');
        return;
      }
      const errorMsg = err?.response?.data?.message || getErrorMessage(err, 'Failed to send email');
      showToast(errorMsg, 'error');
      console.error('Email send error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Send push
  const sendPush = async () => {
    setLoading(true);
    try {
      const payload = { title, body, url };
      if (recipientType === 'specific' && selectedUsers.length) {
        payload.userIds = selectedUsers.map((u) => u._id);
      } else {
        if (selectedDepartments.length) payload.departments = selectedDepartments;
        if (selectedPrograms.length) payload.programs = selectedPrograms;
      }

      const res = await api.post('/developer/alerts/push', payload);
      const attempted = res.data?.attempted || 0;
      const sent = res.data?.sent || 0;
      const failed = res.data?.failed || 0;
      
      if (attempted === 0) {
        showToast('⚠️ No users found with push notifications enabled', 'warning');
      } else {
        showToast(`✅ Push notification sent! Delivered: ${sent}, Failed: ${failed}`, 'success');
      }
      
      // Reset form
      setTitle('');
      setBody('');
      setUrl('');
      setSelectedUsers([]);
      setSelectedDepartments([]);
      setSelectedPrograms([]);
      setConfirmModal({ isOpen: false, type: null, recipientCount: 0 });
    } catch (err) {
      const errorMsg = err?.response?.data?.message || getErrorMessage(err, 'Failed to send push notification');
      showToast(errorMsg, 'error');
      console.error('Push send error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (confirmModal.type === 'email') {
      sendEmail();
    } else if (confirmModal.type === 'push') {
      sendPush();
    }
  };

  const handleCancel = () => {
    setConfirmModal({ isOpen: false, type: null, recipientCount: 0 });
  };

  return (
    <div className={styles.container}>
      {/* HEADER */}
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <h2>🚀 Custom Alerts</h2>
          <p>Send targeted email and push notifications to your users</p>
        </div>
        <div className={styles.badge}>Developer Tool</div>
      </div>

      {/* MAIN GRID */}
      <div className={styles.grid}>
        {/* RECIPIENT CONFIGURATION */}
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>
            <span className={styles.cardIcon}>👥</span>
            Recipients
          </h3>
          <div className={styles.recipientSection}>
            <div className={styles.radioGroup}>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="recipientType"
                  checked={recipientType === 'filter'}
                  onChange={() => setRecipientType('filter')}
                />
                Filter by criteria
              </label>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="recipientType"
                  checked={recipientType === 'specific'}
                  onChange={() => setRecipientType('specific')}
                />
                Specific users
              </label>
            </div>

            {/* SPECIFIC USERS MODE */}
            {recipientType === 'specific' && (
              <div className={styles.searchSection}>
                <form onSubmit={searchUsers} className={styles.searchForm}>
                  <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="Search by name, email, or candidate ID..."
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    disabled={searching}
                  />
                  <button type="submit" className={styles.searchBtn} disabled={searching}>
                    {searching ? (
                      <>
                        <span className={styles.spinner} /> Searching
                      </>
                    ) : (
                      <>🔍 Search</>
                    )}
                  </button>
                </form>

                {searchResults.length > 0 && (
                  <div className={styles.selectedCount}>
                    Selected: {selectedUsers.length} / {searchResults.length}
                  </div>
                )}

                {searchResults.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className={styles.secondaryBtn}
                      onClick={selectAllUsers}
                      style={{ flex: 1 }}
                    >
                      ✓ Select All
                    </button>
                    <button
                      className={styles.secondaryBtn}
                      onClick={deselectAllUsers}
                      style={{ flex: 1 }}
                    >
                      ✕ Deselect All
                    </button>
                  </div>
                )}

                {searchResults.length > 0 ? (
                  <div className={styles.resultsContainer}>
                    {searchResults.map((u) => (
                      <div
                        key={u._id}
                        className={styles.resultItem}
                        onClick={() => toggleSelectUser(u)}
                      >
                        <input
                          type="checkbox"
                          checked={!!selectedUsers.find((x) => x._id === u._id)}
                          onChange={() => toggleSelectUser(u)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div>
                          <div className={styles.resultName}>{u.name || u.email}</div>
                          <div className={styles.resultMeta}>
                            {u.email || u.cand_id}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.noResults}>
                    {q ? 'No users found' : 'Enter a search term to find users'}
                  </div>
                )}
              </div>
            )}

            {/* FILTER MODE */}
            {recipientType === 'filter' && (
              <div className={styles.filterSection}>
                {/* DEPARTMENTS */}
                <div className={styles.filterGroup}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div className={styles.filterGroupTitle}>
                      🏢 Departments
                    </div>
                  </div>

                  {/* Department Search */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <input
                      type="text"
                      className={styles.searchInput}
                      placeholder="Search departments by name..."
                      value={deptSearchQ}
                      onChange={(e) => setDeptSearchQ(e.target.value)}
                      style={{ flex: 1, fontSize: '13px', padding: '8px 12px' }}
                    />
                    <button
                      className={styles.secondaryBtn}
                      onClick={searchDepartments}
                      style={{ flex: 'none', padding: '8px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}
                    >
                      🔍 Search
                    </button>
                    {deptSearchQ && (
                      <button
                        className={styles.secondaryBtn}
                        onClick={() => {
                          setDeptSearchQ('');
                          setFilteredDepartments(departments.slice(0, 5));
                        }}
                        style={{ flex: 'none', padding: '8px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {deptsLoading ? (
                    <div className={styles.emptyState}>Loading departments...</div>
                  ) : filteredDepartments.length > 0 ? (
                    <>
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                        <button
                          className={styles.secondaryBtn}
                          onClick={selectAllDepts}
                          style={{ padding: '6px 10px', fontSize: '12px', flex: 'none' }}
                        >
                          All
                        </button>
                        <button
                          className={styles.secondaryBtn}
                          onClick={deselectAllDepts}
                          style={{ padding: '6px 10px', fontSize: '12px', flex: 'none' }}
                        >
                          None
                        </button>
                        {deptSearchQ && (
                          <span style={{ fontSize: '12px', color: '#475569', padding: '6px 10px' }}>
                            {filteredDepartments.length} of {departments.length} matching
                          </span>
                        )}
                        {!deptSearchQ && (
                          <span style={{ fontSize: '12px', color: '#475569', padding: '6px 10px' }}>
                            Showing 5 of {departments.length}
                          </span>
                        )}
                      </div>
                      <div className={styles.deptGrid}>
                        {filteredDepartments.map((d) => (
                          <label key={d.dpt_id} className={styles.checkboxLabel}>
                            <input
                              type="checkbox"
                              checked={selectedDepartments.includes(d.dpt_id)}
                              onChange={() => toggleDept(d.dpt_id)}
                            />
                            {d.department_name}
                          </label>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className={styles.emptyState}>No departments found</div>
                  )}
                </div>

                {/* PROGRAMS */}
                <div className={styles.filterGroup}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div className={styles.filterGroupTitle}>
                      📚 Programs
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className={styles.secondaryBtn}
                        onClick={selectAllPrograms}
                        style={{ padding: '6px 10px', fontSize: '12px', flex: 'none' }}
                      >
                        All
                      </button>
                      <button
                        className={styles.secondaryBtn}
                        onClick={deselectAllPrograms}
                        style={{ padding: '6px 10px', fontSize: '12px', flex: 'none' }}
                      >
                        None
                      </button>
                    </div>
                  </div>
                  <div className={styles.programGrid}>
                    {PROGRAMS.map((p) => (
                      <label key={p} className={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked={selectedPrograms.includes(p)}
                          onChange={() => toggleProgram(p)}
                        />
                        {p}
                      </label>
                    ))}
                  </div>
                </div>

                {selectedDepartments.length === 0 && selectedPrograms.length === 0 && (
                  <div className={styles.recipientInfo}>
                    ⚠️ No filters selected. Leave empty to send to ALL candidates.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* EMAIL SECTION */}
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>
            <span className={styles.cardIcon}>📧</span>
            Email Broadcast
          </h3>
          <div className={styles.formSection}>
            <div className={styles.formField}>
              <label className={styles.label}>Subject *</label>
              <input
                type="text"
                className={styles.input}
                placeholder="Email subject line..."
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className={styles.formField}>
              <label className={styles.label}>Message *</label>
              <textarea
                className={styles.textarea}
                placeholder="Email message body..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={loading}
              />
            </div>

            {recipientType === 'specific' && selectedUsers.length > 0 && (
              <div className={styles.recipientInfo}>
                📧 Recipients: <strong>{selectedUsers.length} user(s)</strong>
              </div>
            )}

            {recipientType === 'filter' && (
              <div className={styles.recipientInfo}>
                {selectedDepartments.length > 0 || selectedPrograms.length > 0
                  ? `📊 Filtering by ${selectedDepartments.length} dept(s) and/or ${selectedPrograms.length} program(s)`
                  : '📊 Will send to ALL candidates'}
              </div>
            )}

            <button
              className={styles.primaryBtn}
              onClick={initiateEmailSend}
              disabled={loading || !canSendEmail}
            >
              {loading ? (
                <>
                  <span className={styles.spinner} /> Sending...
                </>
              ) : (
                <>✉️ Send Email</>
              )}
            </button>
          </div>
        </div>

        {/* PUSH NOTIFICATION SECTION */}
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>
            <span className={styles.cardIcon}>🔔</span>
            Push Notification
          </h3>
          <div className={styles.formSection}>
            <div className={styles.formField}>
              <label className={styles.label}>Title *</label>
              <input
                type="text"
                className={styles.input}
                placeholder="Notification title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className={styles.formField}>
              <label className={styles.label}>Message *</label>
              <input
                type="text"
                className={styles.input}
                placeholder="Notification message..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className={styles.formField}>
              <label className={styles.label}>URL (optional)</label>
              <input
                type="text"
                className={styles.input}
                placeholder="https://example.com or /path"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loading}
              />
            </div>

            {recipientType === 'specific' && selectedUsers.length > 0 && (
              <div className={styles.recipientInfo}>
                🔔 Recipients: <strong>{selectedUsers.length} user(s)</strong>
              </div>
            )}

            {recipientType === 'filter' && (
              <div className={styles.recipientInfo}>
                {selectedDepartments.length > 0 || selectedPrograms.length > 0
                  ? `📊 Filtering by ${selectedDepartments.length} dept(s) and/or ${selectedPrograms.length} program(s)`
                  : '📊 Will send to ALL candidates'}
              </div>
            )}

            <button
              className={styles.primaryBtn}
              onClick={initiatePushSend}
              disabled={loading || !canSendPush}
            >
              {loading ? (
                <>
                  <span className={styles.spinner} /> Sending...
                </>
              ) : (
                <>🚀 Send Notification</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* CONFIRMATION MODAL */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.type === 'email' ? '📧 Confirm Email Broadcast' : '🔔 Confirm Push Notification'}
        message={
          confirmModal.type === 'email'
            ? `Are you sure you want to send this email to ${
                recipientType === 'specific'
                  ? `${selectedUsers.length} selected user(s)`
                  : 'the filtered recipients'
              }?`
            : `Are you sure you want to send this notification to ${
                recipientType === 'specific'
                  ? `${selectedUsers.length} selected user(s)`
                  : 'the filtered recipients'
              }?`
        }
        recipientCount={
          recipientType === 'specific' ? selectedUsers.length : 0
        }
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        loading={loading}
      />
    </div>
  );
};

export default DeveloperCustomAlert;
