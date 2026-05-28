import React from 'react';
import { Link } from 'react-router-dom';
import { FaLock, FaIdCard, FaComments } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import styles from '../Astyles/lecturerPortal.module.css';
import GroupChat from './GroupChat';

const LecturerChatGate = () => {
  const { user } = useAuth();
  const isPending = String(user?.account_status || 'active') !== 'active';

  if (isPending) {
    return (
      <div className={styles.page}>
        <div className={styles.lockScreen}>
          <FaLock className={styles.lockIcon2} />
          <h2 className={styles.lockTitle}>Chat Locked</h2>
          <p className={styles.lockDesc}>
            Complete verification and wait for approval before chatting with students.
          </p>
          <Link className={styles.button} to="/lecturer/profile-verification">
            <FaIdCard /> Complete Verification Profile
          </Link>
        </div>
      </div>
    );
  }

  return <GroupChat mode="candidate" featureLabel="Lecturer Chat" featureIcon={FaComments} />;
};

export default LecturerChatGate;
