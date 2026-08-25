import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { showToast } from '../../utility/ToastNotification';
import { getErrorMessage } from '../../utility/getErrorMessage';
import styles from '../../Astyles/ConcoursPartner.module.css';

export default function ConcoursPartnerProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async () => {
    try {
      const res = await api.get('/concours/partner/status');
      if (!res.data?.success) throw new Error(res.data?.message || 'Failed to load profile');
      setProfile(res.data);
    } catch (err) {
      showToast(getErrorMessage(err, 'Unable to load profile.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleChange = (field, value) => {
    setProfile((prev) => ({
      ...prev,
      organization: {
        ...prev?.organization,
        [field]: value,
      },
    }));
  };

  if (loading) {
    return <div className={styles.loading}>Loading organization profile...</div>;
  }

  const org = profile?.organization || {};
  const partnership = profile?.partnership || {};

  return (
    <div className={styles.concoursList}>
      <div className={styles.concoursListHeader}>
        <h1 className={styles.concoursListTitle}>Organization Profile</h1>
        <p className={styles.concoursListSubtitle}>View and manage your organization details.</p>
      </div>

      <div className={styles.formFieldContainer}>
        <h2 className={styles.concoursItemTitle}>Organization Information</h2>

        <div className={styles.formField}>
          <label className={styles.formFieldLabel}>Organization Name</label>
          <input
            className={styles.formFieldInput}
            type="text"
            value={org.name || ''}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="Your organization name"
            disabled
          />
        </div>

        <div className={styles.formField}>
          <label className={styles.formFieldLabel}>Contact Person</label>
          <input
            className={styles.formFieldInput}
            type="text"
            value={org.contact_person || ''}
            onChange={(e) => handleChange('contact_person', e.target.value)}
            placeholder="Contact person name"
            disabled
          />
        </div>

        <div className={styles.formField}>
          <label className={styles.formFieldLabel}>Website</label>
          <input
            className={styles.formFieldInput}
            type="url"
            value={org.website || ''}
            onChange={(e) => handleChange('website', e.target.value)}
            placeholder="https://example.com"
            disabled
          />
        </div>

        <div className={styles.formField}>
          <label className={styles.formFieldLabel}>Description</label>
          <textarea
            className={styles.formFieldTextarea}
            value={org.description || ''}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="Brief description of your organization"
            disabled
          />
        </div>
      </div>

      <div className={styles.formFieldContainer}>
        <h2 className={styles.concoursItemTitle}>Partnership Status</h2>

        <div className={styles.formField}>
          <label className={styles.formFieldLabel}>Partnership Status</label>
          <div className={styles.partnershipStatusValue} style={{ width: 'fit-content' }}>
            {String(partnership.status || 'pending').replace(/_/g, ' ')}
          </div>
        </div>

        {partnership.start_at && (
          <div className={styles.formField}>
            <label className={styles.formFieldLabel}>Partnership Started</label>
            <input
              className={styles.formFieldInput}
              type="text"
              value={new Date(partnership.start_at).toLocaleDateString()}
              disabled
            />
          </div>
        )}

        {partnership.expires_at && (
          <div className={styles.formField}>
            <label className={styles.formFieldLabel}>Partnership Expires</label>
            <input
              className={styles.formFieldInput}
              type="text"
              value={new Date(partnership.expires_at).toLocaleDateString()}
              disabled
            />
          </div>
        )}

        {partnership.agreement?.generated_at && (
          <div className={styles.formField}>
            <label className={styles.formFieldLabel}>Agreement Generated</label>
            <input
              className={styles.formFieldInput}
              type="text"
              value={new Date(partnership.agreement.generated_at).toLocaleDateString()}
              disabled
            />
          </div>
        )}

        {partnership.agreement?.accepted_at && (
          <div className={styles.formField}>
            <label className={styles.formFieldLabel}>Agreement Accepted</label>
            <input
              className={styles.formFieldInput}
              type="text"
              value={new Date(partnership.agreement.accepted_at).toLocaleDateString()}
              disabled
            />
          </div>
        )}
      </div>
    </div>
  );
}
