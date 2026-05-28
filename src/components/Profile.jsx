import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api';
import GraduationCapLoader from './GraduationCapLoader';
import { FaUserCircle } from 'react-icons/fa';
import { Eye, EyeOff } from 'lucide-react';
import styles from '../Astyles/Profile.module.css';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import { useAuth } from '../context/AuthContext';
import { maskCandidateId } from '../utility/maskCandidateId';

const normalizeUserId = (raw) => {
  let s = String(raw || '').split('"').join('').trim();
  while (s.startsWith('/')) s = s.slice(1);
  while (s.endsWith('/')) s = s.slice(0, -1);
  return s;
};

const Profile = () => {
  const { user } = useAuth();
  const cand_id = normalizeUserId(user?.cand_id);
  const fileInputRef = useRef(null);
  const backendOrigin = api.defaults.baseURL?.replace(/\/api$/, '')?.replace(/\/$/, '') || '';
  const buildImageUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    if (url.startsWith('/')) return `${backendOrigin}${url}`;
    return `${backendOrigin}/${url}`;
  };

  const [loading, setLoading] = useState(true);
  const [savingPicture, setSavingPicture] = useState(false);
  const [editable, setEditable] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  const [profile, setProfile] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
  });

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    // JWT handles credentials automatically
  }, []);

  useEffect(() => {
    if (!cand_id) {
      showToast('Session expired. Please login again.', 'error');
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await api.get(`/candidate/profile/${cand_id}`);
        if (cancelled) return;

        setProfile(data);
        setFormData({
          name: data?.name || '',
          phone: data?.phone || '',
          address: data?.address || '',
        });
      } catch (err) {
        if (!cancelled) showToast(getErrorMessage(err, 'Failed to fetch profile data.'), 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [cand_id]);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [selectedFile]);

  const roleLabel = useMemo(() => {
    const r = String(profile?.role || '').toLowerCase();
    if (r === 'admin') return 'Admin';
    if (r === 'candidate') return 'Candidate';
    return 'User';
  }, [profile?.role]);

  const createdAtLabel = useMemo(() => {
    if (!profile?.createdAt) return '-';
    const d = new Date(profile.createdAt);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString();
  }, [profile?.createdAt]);

  const onChangeField = (e) => {
    const { name, value } = e.target;
    setFormData((p) => ({ ...p, [name]: value }));
  };

  const openImagePreview = () => {
    if (pictureSrc) setPreviewModalOpen(true);
  };

  const onSaveProfile = async () => {
    setSavingPicture(true);
    try {
      await api.put(
        `/candidate/profile/update/${cand_id}`,
        { name: formData.name, phone: formData.phone, address: formData.address || null }
      );

      let updatedProfile = profile ? { ...profile } : { name: formData.name, phone: formData.phone, address: formData.address };

      if (selectedFile) {
        const data = new FormData();
        data.append('profile_picture', selectedFile);
        const uploadRes = await api.post(`/candidate/profile/upload-picture/${cand_id}`, data);

        if (!uploadRes?.data?.profile_picture) {
          console.error('[Profile] Upload response did not include profile_picture', uploadRes?.data);
          showToast('Profile picture upload failed', 'error');
          setSavingPicture(false);
          return;
        }

        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        setSelectedFile(null);
        setPreviewUrl(null);

        const refreshed = await api.get(`/candidate/profile/${cand_id}`);
        console.log('[Profile] Refreshed profile after upload', refreshed?.data);
        if (refreshed?.data) {
          updatedProfile = {
            ...updatedProfile,
            ...refreshed.data,
            profile_picture: refreshed.data.profile_picture || uploadRes.data.profile_picture,
          };
        } else {
          updatedProfile.profile_picture = uploadRes.data.profile_picture;
        }
      }

      updatedProfile = {
        ...updatedProfile,
        name: formData.name,
        phone: formData.phone,
        address: formData.address,
      };
      setProfile(updatedProfile);

      showToast('Profile updated successfully', 'success');
      setEditable(false);
    } catch (err) {
      console.error('[Profile] Save profile error', {
        message: err?.message,
        response: err?.response?.data || err?.response,
        stack: err?.stack,
      });
      showToast(getErrorMessage(err, 'Failed to update profile'), 'error');
    } finally {
      setSavingPicture(false);
    }
  };

  const onChangePassword = async () => {
    if (!newPassword || !confirmPassword) return showToast('Password fields cannot be empty', 'error');
    if (newPassword !== confirmPassword) return showToast('Passwords do not match', 'error');

    try {
      await api.put(
        `/candidate/profile/update-password/${cand_id}`,
        { newPassword }
      );
      showToast('Password updated successfully', 'success');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to update password'), 'error');
    }
  };

  if (loading) return <GraduationCapLoader fullscreen label="Loading profile..." />;

  const pictureSrc = previewUrl
    ? previewUrl
    : profile?.profile_picture
      ? buildImageUrl(profile.profile_picture)
      : null;

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <div className={styles.title}>Profile</div>
          <div className={styles.subtitle}>Manage your account information</div>
        </div>
        <button type="button" className={styles.editBtn} onClick={() => setEditable((v) => !v)}>
          {editable ? 'Done' : 'Edit'}
        </button>
      </div>

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.cardTitle}>Overview</div>

          <div className={styles.avatarRow}>
            {pictureSrc ? (
              <img
              src={pictureSrc}
              alt="Profile"
              className={styles.avatar}
              onClick={openImagePreview}
              onError={(ev) => console.error('[Profile] Image failed to load:', {
                src: pictureSrc,
                alt: ev.target.alt,
                event: ev,
              })}
              style={{ cursor: 'pointer' }}
            />
            ) : (
              <FaUserCircle className={styles.avatarFallback} />
            )}

                    <div className={styles.avatarActions}>
              <div className={styles.name}>{profile?.name || '-'}</div>
              <div className={styles.metaLine}>{profile?.email || '-'}</div>
              <div className={styles.metaLine}>Role: {roleLabel}</div>
              <div className={styles.metaLine}>
                Department: {profile?.department?.department_name || '-'}
              </div>
              <div className={styles.metaLine}>Academic year: {profile?.academic_year || '-'}</div>
              <div className={styles.metaLine}>Registered: {createdAtLabel}</div>

              <div className={styles.uploadRow}>
                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  accept="image/*"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Change photo
                </button>
                {selectedFile && (
                  <>
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      onClick={() => {
                        if (fileInputRef.current) {
                          fileInputRef.current.value = '';
                        }
                        setSelectedFile(null);
                      }}
                    >
                      Remove
                    </button>
                    <button type="button" className={styles.primaryBtn} onClick={onSaveProfile} disabled={savingPicture}>
                      {savingPicture ? 'Saving...' : 'Save photo'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardTitle}>Personal information</div>

          <div className={styles.field}>
            <label>Matricule / ID</label>
            <input type="text" value={maskCandidateId(profile?.cand_id)} readOnly />
          </div>

          <div className={styles.field}>
            <label>Full name</label>
            <input name="name" type="text" value={formData.name} readOnly={!editable} onChange={onChangeField} />
          </div>

          <div className={styles.field}>
            <label>Phone</label>
            <input name="phone" type="text" value={formData.phone} readOnly={!editable} onChange={onChangeField} />
          </div>

          <div className={styles.field}>
            <label>Address</label>
            <input name="address" type="text" value={formData.address} readOnly={!editable} onChange={onChangeField} />
          </div>

          {editable && (
            <button type="button" className={styles.primaryBtn} onClick={onSaveProfile} disabled={savingPicture}>
              {savingPicture ? 'Saving...' : 'Save changes'}
            </button>
          )}
        </section>

        <section className={`${styles.card} ${styles.fullWidth}`}>
          <div className={styles.cardTitle}>Security</div>

          <div className={styles.securityGrid}>
            <div className={styles.field}>
              <label>New password</label>
              <div className={styles.passwordRow}>
                <input type={showNew ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                <button type="button" className={styles.iconBtn} onClick={() => setShowNew((v) => !v)}>
                  {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className={styles.field}>
              <label>Confirm password</label>
              <div className={styles.passwordRow}>
                <input type={showConfirm ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                <button type="button" className={styles.iconBtn} onClick={() => setShowConfirm((v) => !v)}>
                  {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>

          <button type="button" className={styles.primaryBtn} onClick={onChangePassword}>
            Update password
          </button>
        </section>
      </div>

      {previewModalOpen && pictureSrc && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 1500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setPreviewModalOpen(false)}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '100%',
              maxHeight: '100%',
              borderRadius: 16,
              overflow: 'hidden',
              boxShadow: '0 0 40px rgba(0,0,0,0.35)',
              background: '#000',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewModalOpen(false)}
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                zIndex: 1,
                background: 'rgba(255,255,255,0.9)',
                border: 'none',
                borderRadius: '50%',
                width: 32,
                height: 32,
                cursor: 'pointer',
                fontSize: 18,
                lineHeight: '32px',
              }}
            >
              ×
            </button>
            <img
              src={pictureSrc}
              alt="Profile preview"
              onError={(ev) => console.error('[Profile] Preview image failed to load:', {
                src: pictureSrc,
                alt: ev.target.alt,
                event: ev,
              })}
              style={{
                display: 'block',
                maxWidth: '90vw',
                maxHeight: '90vh',
                objectFit: 'contain',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
