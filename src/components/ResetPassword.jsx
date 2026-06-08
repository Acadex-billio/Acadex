import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import api from '../services/api';
import styles from '../Astyles/ResetPassword.module.css';
import { showToast } from '../utility/ToastNotification';
import { X, Mail, Lock, Check } from 'lucide-react';

const ResetPassword = ({ onClose }) => {
    const [email, setEmail] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [step, setStep] = useState(1);
    const [errorMessage, setErrorMessage] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSendCode = async (e) => {
        e.preventDefault();
        if (!email.trim()) {
            setErrorMessage('Please enter your email');
            return;
        }
        setLoading(true);
        try {
            await api.post('/auth/reset-password', { email });
            setStep(2);
            setErrorMessage('');
            showToast('Verification code sent! Check your email.', 'success');
        } catch (error) {
            const message = error.response?.data?.message || "Error sending code.";
            setErrorMessage(message);
            showToast(message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdatePassword = async (e) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            setErrorMessage('Passwords do not match.');
            showToast('Passwords do not match.', 'error');
            return;
        }
        if (newPassword.length < 5) {
            setErrorMessage('Password must be at least 5 characters.');
            return;
        }
        setLoading(true);
        try {
            await api.post('/auth/update-password', {
                email,
                code: verificationCode,
                newPassword,
            });
            showToast('Password updated successfully!', 'success');
            onClose();
        } catch (error) {
            const message = error.response?.data?.message || "Error updating password.";
            setErrorMessage(message);
            showToast(message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleBackStep = () => {
        setStep(1);
        setErrorMessage('');
        setVerificationCode('');
    };

    return (
        <>
            <Helmet>
                <title>Reset Password - Acadex</title>
                <meta name="description" content="Reset your password for Acadex." />
            </Helmet>
            <div className={styles.backdrop} onClick={onClose} />
            <div className={styles.popupContainer}>
                <div className={styles.header}>
                    <h2 className={styles.title}>
                        {step === 1 ? 'Reset Password' : 'Create New Password'}
                    </h2>
                    <button
                        type="button"
                        className={styles.closeBtn}
                        onClick={onClose}
                        aria-label="Close"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className={styles.content}>
                    {errorMessage && (
                        <div className={styles.errorAlert}>
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    {step === 1 ? (
                        <form onSubmit={handleSendCode} className={styles.form}>
                            <p className={styles.description}>
                                Enter your email address and we'll send you a verification code to reset your password.
                            </p>

                            <div className={styles.formGroup}>
                                <label htmlFor="email">Email Address</label>
                                <div className={styles.inputWrapper}>
                                    <Mail size={18} />
                                    <input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="your.email@example.com"
                                        required
                                        disabled={loading}
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                className={styles.submitBtn}
                                disabled={loading}
                            >
                                {loading ? 'Sending...' : 'Send Code'}
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleUpdatePassword} className={styles.form}>
                            <p className={styles.description}>
                                Enter the verification code sent to {email} and create a new password.
                            </p>

                            <div className={styles.formGroup}>
                                <label htmlFor="code">Verification Code</label>
                                <input
                                    id="code"
                                    type="text"
                                    value={verificationCode}
                                    onChange={(e) => setVerificationCode(e.target.value)}
                                    placeholder="Enter 6-digit code"
                                    required
                                    disabled={loading}
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="newPassword">New Password</label>
                                <div className={styles.inputWrapper}>
                                    <Lock size={18} />
                                    <input
                                        id="newPassword"
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="At least 5 characters"
                                        required
                                        minLength={5}
                                        disabled={loading}
                                    />
                                </div>
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="confirmPassword">Confirm Password</label>
                                <div className={styles.inputWrapper}>
                                    <Check size={18} />
                                    <input
                                        id="confirmPassword"
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="Confirm your password"
                                        required
                                        minLength={5}
                                        disabled={loading}
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                className={styles.submitBtn}
                                disabled={loading}
                            >
                                {loading ? 'Updating...' : 'Update Password'}
                            </button>

                            <button
                                type="button"
                                className={styles.backBtn}
                                onClick={handleBackStep}
                                disabled={loading}
                            >
                                Back
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </>
    );
};

export default ResetPassword;