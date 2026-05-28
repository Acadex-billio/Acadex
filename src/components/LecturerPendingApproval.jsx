import React from 'react';
import { Link } from 'react-router-dom';
import {
  FaClock,
  FaCheckCircle,
  FaShieldAlt,
  FaIdCard,
  FaArrowRight,
  FaSignInAlt,
} from 'react-icons/fa';
import styles from '../Astyles/lecturerPortal.module.css';

const LecturerPendingApproval = () => {
  return (
    <div className={styles.pendingPage}>
      <div className={styles.pendingCard}>
        <div className={styles.pendingIconWrap}>
          <FaClock className={styles.pendingClockIcon} />
        </div>
        <h1 className={styles.pendingTitle}>Account Under Review</h1>
        <p className={styles.pendingDesc}>
          Your lecturer account is currently being reviewed by our team.
          This usually takes <strong>1–3 business days</strong>. Complete your
          verification profile to speed up the process.
        </p>

        <div className={styles.pendingSteps}>
          <div className={`${styles.pendingStep} ${styles.pendingStepDone}`}>
            <span className={styles.pendingStepDot}><FaCheckCircle /></span>
            <div className={styles.pendingStepText}>
              <strong>Registration Complete</strong>
              <span>Account created successfully.</span>
            </div>
          </div>
          <div className={`${styles.pendingStep} ${styles.pendingStepActive}`}>
            <span className={styles.pendingStepDotActive}><FaIdCard /></span>
            <div className={styles.pendingStepText}>
              <strong>Verification Profile</strong>
              <span>Submit your ID, qualifications, and credentials.</span>
            </div>
          </div>
          <div className={`${styles.pendingStep} ${styles.pendingStepWaiting}`}>
            <span className={styles.pendingStepDotWaiting}><FaClock /></span>
            <div className={styles.pendingStepText}>
              <strong>Developer Review</strong>
              <span>Our team is verifying your submitted documents.</span>
            </div>
          </div>
          <div className={`${styles.pendingStep} ${styles.pendingStepLocked}`}>
            <span className={styles.pendingStepDotLocked}><FaShieldAlt /></span>
            <div className={styles.pendingStepText}>
              <strong>Account Activated</strong>
              <span>Full access to bookings and earnings unlocked.</span>
            </div>
          </div>
        </div>

        <div className={styles.pendingActions}>
          <Link className={styles.button} to="/lecturer/profile-verification">
            <FaIdCard /> Complete Verification Profile <FaArrowRight />
          </Link>
          <Link className={styles.buttonAlt} to="/login">
            <FaSignInAlt /> Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default LecturerPendingApproval;
