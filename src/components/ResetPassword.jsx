import React, { useState } from 'react';
import { Form, Button } from 'react-bootstrap';
import { Helmet } from 'react-helmet';
import api from '../services/api';
import styles from '../Astyles/ResetPassword.module.css';
import { showToast } from '../utility/ToastNotification';

const ResetPassword = ({ onClose }) => {
    const [email, setEmail] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [step, setStep] = useState(1); // 1 for sending code, 2 for updating password
    const [errorMessage, setErrorMessage] = useState('');

    const handleSendCode = async (e) => {
        e.preventDefault();
        try {
            await api.post('/auth/reset-password', { email });
            setStep(2); // Move to the next step
            showToast('Verification code sent! Please check your email.', 'success'); // Success toast
        } catch (error) {

            const message = error.response?.data?.message || "Error sending code.";
            setErrorMessage(message);
            showToast(message, 'error'); // Error toast
        }
    };

    const handleUpdatePassword = async (e) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            const message = "Passwords do not match.";
            setErrorMessage(message);
            showToast(message, 'error'); // Toast for password mismatch
            return;
        }

        try {
            await api.post('/auth/update-password', {
                email,
                code: verificationCode,
                newPassword,
            });
            showToast('Password updated successfully! You can now log in.', 'success'); // Success toast
            onClose(); // Close the popup
        } catch (error) {

            const message = error.response?.data?.message || "Error updating password.";
            setErrorMessage(message);
            showToast(message, 'error'); // Error toast
        }
    };

    return (
        <div className={styles.popupContainer}>
            <Helmet>
                <title>Reset Password - Acadex</title>
                <meta name="description" content="Reset your password for the Acadex." />
            </Helmet>
            <h2 className={styles.title}>Reset Password</h2>
            {errorMessage && <div className={styles.error}>{errorMessage}</div>}
            {step === 1 ? (
                <Form onSubmit={handleSendCode} className={styles.form}>
                    <Form.Group>
                        <Form.Label>Email</Form.Label>
                        <Form.Control
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </Form.Group>
                    <Form.Group>
                        <Form.Label>Select Method</Form.Label>
                        <Form.Control as="select" disabled>
                            <option value="email">Email</option>
                            <option value="sms">SMS</option>
                            <option value="whatsapp">WhatsApp</option>
                        </Form.Control>
                    </Form.Group>
                    <Button variant="primary" type="submit">Send Code</Button>
                    <Button variant="secondary" onClick={onClose} className={styles.cancelButton}>Cancel</Button>
                </Form>
            ) : (
                <Form onSubmit={handleUpdatePassword} className={styles.form}>
                    <Form.Group>
                        <Form.Label>Verification Code</Form.Label>
                        <Form.Control
                            type="text"
                            value={verificationCode}
                            onChange={(e) => setVerificationCode(e.target.value)}
                            required
                        />
                    </Form.Group>
                    <Form.Group>
                        <Form.Label>New Password</Form.Label>
                        <Form.Control
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                        />
                    </Form.Group>
                    <Form.Group>
                        <Form.Label>Confirm New Password</Form.Label>
                        <Form.Control
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                        />
                    </Form.Group>
                    <Button variant="primary" type="submit">Update</Button>
                    <Button variant="secondary" onClick={onClose} className={styles.cancelButton}>Cancel</Button>
                </Form>
            )}
        </div>
    );
};

export default ResetPassword;