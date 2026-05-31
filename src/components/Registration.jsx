import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import styles from '../Astyles/Registration.module.css';
import { showToast } from '../utility/ToastNotification';
import { Eye, EyeOff } from 'lucide-react';
import { useLoading } from '../context/LoadingContext';

const Registration = () => {
  const navigate = useNavigate();
  const { startLoading, stopLoading } = useLoading();
  const { t, i18n } = useTranslation();
  const triggerLinkLoading = () => {
    startLoading();
    setTimeout(() => stopLoading(), 450);
  };
  const [currentStep, setCurrentStep] = useState(1);
  const [name, setName] = useState('');
  const [program, setProgram] = useState('HND');
  const [departmentId, setDepartmentId] = useState('');
  const [departmentQuery, setDepartmentQuery] = useState('');
  const [isDepartmentMenuOpen, setIsDepartmentMenuOpen] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [lecturerLanguage, setLecturerLanguage] = useState('en');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const fetchDepartments = async () => {
      if (program === 'LECTURER') {
        setDepartments([]);
        return;
      }
      try {
        const res = await api.get(`/auth/departments?program=${encodeURIComponent(program)}`);
        setDepartments(Array.isArray(res.data) ? res.data : []);
      } catch (error) {
        showToast('Failed to load departments', 'error');
      }
    };
    setDepartmentId('');
    setDepartmentQuery('');
    fetchDepartments();
  }, [program]);

  const filteredDepartments = useMemo(() => {
    const q = String(departmentQuery || '').trim().toLowerCase();
    if (!q) return departments;

    return departments.filter((d) => {
      const name = String(d?.department_name || '').toLowerCase();
      const abbreviation = String(d?.abbreviation || '').toLowerCase();
      const faculty = String(d?.faculty || '').toLowerCase();
      return name.includes(q) || abbreviation.includes(q) || faculty.includes(q);
    });
  }, [departmentQuery, departments]);

  const selectedDepartment = useMemo(
    () => departments.find((d) => String(d?.dpt_id || '') === String(departmentId || '')) || null,
    [departments, departmentId]
  );

  useEffect(() => {
    const defaultLanguage = program === 'BTS' ? 'fr' : 'en';
    if (i18n.language !== defaultLanguage) {
      i18n.changeLanguage(defaultLanguage);
    }
  }, [program, i18n]);

  const validatePasswordStrength = (pwd) => {
    if (pwd.length < 8) return "Too short";
    if (pwd.length > 20) return "Too long";
    if (!/[A-Z]/.test(pwd)) return "Missing uppercase";
    if (!/[a-z]/.test(pwd)) return "Missing lowercase";
    if (!/[0-9]/.test(pwd)) return "Must include number";
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) return "Must include symbol";
    return "Strong password";
  };

  const validateStep1 = () => {
    setErrorMessage('');
    if (!name.trim()) {
      const msg = "Please enter your name";
      setErrorMessage(msg);
      showToast(msg, 'warning');
      return false;
    }
    if (!email.trim()) {
      const msg = "Please enter your email";
      setErrorMessage(msg);
      showToast(msg, 'warning');
      return false;
    }
    if (!phone.trim()) {
      const msg = "Please enter your phone number";
      setErrorMessage(msg);
      showToast(msg, 'warning');
      return false;
    }
    if (!password) {
      const msg = "Please enter a password";
      setErrorMessage(msg);
      showToast(msg, 'warning');
      return false;
    }
    const pwdValidation = validatePasswordStrength(password);
    if (pwdValidation !== "Strong password") {
      setErrorMessage(`Password invalid: ${pwdValidation}`);
      showToast(`⚠️ Password invalid: ${pwdValidation}`, 'warning');
      return false;
    }
    if (!confirmPassword) {
      const msg = "Please confirm your password";
      setErrorMessage(msg);
      showToast(msg, 'warning');
      return false;
    }
    if (password !== confirmPassword) {
      const msg = "Passwords do not match";
      setErrorMessage(msg);
      showToast(msg, 'error');
      return false;
    }
    return true;
  };

  const handleNextStep = (e) => {
    e.preventDefault();
    if (validateStep1()) {
      setCurrentStep(2);
    }
  };

  const handleBackStep = () => {
    setCurrentStep(1);
    setErrorMessage('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    startLoading();
    setErrorMessage('');

    if (program !== 'LECTURER' && !departmentId) {
      const msg = "⚠️ Please select a department";
      setErrorMessage(msg);
      showToast(msg, "warning");
      stopLoading();
      return;
    }

    try {
      await api.post('/auth/register', {
        name,
        dpt_id: program === 'LECTURER' ? null : (departmentId || null),
        program,
        email,
        phone,
        password,
        ...(program === 'LECTURER' ? { preferred_language: lecturerLanguage } : {}),
      });

      showToast('Registration successful! Redirecting to login...', 'success');

      setTimeout(() => {
        navigate('/login');
        setTimeout(() => stopLoading(), 450);
      }, 2000);

    } catch (error) {
      const message = error.response?.data?.message || "Registration failed.";
      showToast(message, 'error');
      setErrorMessage(message);
      stopLoading();
    }
  };

  return (
    <div className={styles.container}>
      <Helmet>
        <title>{t('registrationPage.title')}</title>
        <meta name="description" content="Create an account to access the Acadex." />
        <meta name="robots" content="index,follow" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Acadex" />
        <meta property="og:title" content="Register | Acadex" />
        <meta property="og:description" content="Create your Acadex account to access study materials and tools." />
        <meta property="og:url" content="https://hnd-platform.vercel.app/register" />
        <meta property="og:image" content="https://hnd-platform.vercel.app/hnd-mark.svg" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="Register | Acadex" />
        <meta name="twitter:description" content="Create your Acadex account to access study materials and tools." />
        <meta name="twitter:image" content="https://hnd-platform.vercel.app/hnd-mark.svg" />
        <link rel="canonical" href="https://hnd-platform.vercel.app/register" />
      </Helmet>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <Link to="/" className={styles.backHome} onClick={triggerLinkLoading}>{t('loginPage.backHome')}</Link>
        <select
          value={i18n.language}
          onChange={(e) => i18n.changeLanguage(e.target.value)}
          aria-label={t('common.language')}
          style={{ height: 40, borderRadius: 12, border: '1px solid #d0d7de', padding: '0 10px' }}
        >
          <option value="en">{t('common.english')}</option>
          <option value="fr">{t('common.french')}</option>
        </select>
      </div>

      <h2 className={styles.title}>{t('registrationPage.heading')}</h2>

      {/* Step Indicator */}
      <div className={styles.stepIndicator}>
        <div className={`${styles.step} ${currentStep === 1 ? styles.stepActive : ''}`}>
          <div className={styles.stepNumber}>1</div>
          <div className={styles.stepLabel}>{t('registrationPage.personalInfo') || 'Personal Info & Password'}</div>
        </div>
        <div className={styles.stepLine}></div>
        <div className={`${styles.step} ${currentStep === 2 ? styles.stepActive : ''}`}>
          <div className={styles.stepNumber}>2</div>
          <div className={styles.stepLabel}>{t('registrationPage.programDept') || 'Program & Department'}</div>
        </div>
      </div>

      <form onSubmit={currentStep === 2 ? handleSubmit : handleNextStep} className={styles.form} noValidate>
        {errorMessage && <div className={styles.error}>{errorMessage}</div>}

        {/* STEP 1: Personal Info & Password */}
        {currentStep === 1 && (
          <>
            <div className={styles.sectionTitle}>👤 {t('registrationPage.personalInformation') || 'Personal Information'}</div>
            
            <div className={styles.formGroup}>
              <label>{t('registrationPage.name')}</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder="Enter your full name"
              />
            </div>

            <div className={styles.formGroup}>
              <label>{t('registrationPage.email')}</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="Enter your email address"
              />
            </div>

            <div className={styles.formGroup}>
              <label>{t('registrationPage.phone')}</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
                placeholder="Enter your phone number"
              />
            </div>

            <div className={styles.sectionTitle} style={{ marginTop: 24 }}>🔐 {t('registrationPage.password') || 'Password'}</div>

            <div className={`${styles.formGroup} ${styles.passwordWrapper}`}>
              <label>{t('registrationPage.password')}</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                maxLength={20}
                autoComplete="new-password"
                placeholder="Min 8 chars: uppercase, lowercase, number, symbol"
              />
              <span
                className={styles.eyeIcon}
                onClick={() => setShowPassword(!showPassword)}
                role="button"
                tabIndex={0}
                aria-label={showPassword ? "Hide password" : "Show password"}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowPassword(!showPassword); } }}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </span>
            </div>

            <div className={`${styles.formGroup} ${styles.passwordWrapper}`}>
              <label>{t('registrationPage.confirmPassword')}</label>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                maxLength={20}
                autoComplete="new-password"
                placeholder="Confirm your password"
              />
              <span
                className={styles.eyeIcon}
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                role="button"
                tabIndex={0}
                aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowConfirmPassword(!showConfirmPassword); } }}
              >
                {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </span>
            </div>

            <button type="submit" className={styles.button}>
              {t('registrationPage.next') || 'Next'} →
            </button>
          </>
        )}

        {/* STEP 2: Program & Department */}
        {currentStep === 2 && (
          <>
            <div className={styles.sectionTitle}>🏢 {t('registrationPage.programDept') || 'Program & Department'}</div>
            
            <div className={styles.formGroup}>
              <label>{t('common.program')}</label>
              <select
                value={program}
                onChange={e => setProgram(e.target.value)}
                required
              >
                <option value="HND">{t('common.hnd')}</option>
                <option value="BTS">{t('common.bts')}</option>
                <option value="LECTURER">LECTURER</option>
              </select>
            </div>

            {program !== 'LECTURER' && (
              <div className={styles.formGroup}>
                <label>{t('registrationPage.department')}</label>
                <div className={styles.searchDropdown}>
                  <input
                    type="text"
                    value={departmentQuery}
                    onFocus={() => setIsDepartmentMenuOpen(true)}
                    onBlur={() => {
                      window.setTimeout(() => setIsDepartmentMenuOpen(false), 120);
                    }}
                    onChange={(e) => {
                      setDepartmentQuery(e.target.value);
                      setDepartmentId('');
                      setIsDepartmentMenuOpen(true);
                    }}
                    placeholder="Search by department name, abbreviation, or faculty"
                    aria-label="Search departments"
                    autoComplete="off"
                    required={!departmentId}
                  />

                  {isDepartmentMenuOpen ? (
                    <div className={styles.dropdownMenu} role="listbox" aria-label="Department options">
                      {filteredDepartments.length > 0 ? (
                        filteredDepartments.map((d) => {
                          const id = String(d?.dpt_id || '');
                          const label = `${d.department_name}${d.abbreviation ? ` (${d.abbreviation})` : ''}${d.faculty ? ` - ${d.faculty}` : ''}`;
                          const isActive = id === departmentId || label === departmentQuery;
                          return (
                            <button
                              key={id}
                              type="button"
                              className={`${styles.dropdownOption} ${isActive ? styles.dropdownOptionActive : ''}`}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setDepartmentId(id);
                                setDepartmentQuery(label);
                                setIsDepartmentMenuOpen(false);
                              }}
                            >
                              {label}
                            </button>
                          );
                        })
                      ) : (
                        <div className={styles.dropdownEmpty}>No departments match your search.</div>
                      )}
                    </div>
                  ) : null}
                </div>

                {!departmentId && !departmentQuery.trim() ? (
                  <small style={{ color: '#64748b', marginTop: 6 }}>{t('registrationPage.selectDepartment')}</small>
                ) : null}
                {departmentId && selectedDepartment ? (
                  <small style={{ color: '#16a34a', marginTop: 6 }}>
                    Selected: {selectedDepartment.department_name}
                    {selectedDepartment.abbreviation ? ` (${selectedDepartment.abbreviation})` : ''}
                  </small>
                ) : null}
              </div>
            )}

            {program === 'LECTURER' && (
              <div className={styles.formGroup}>
                <label>{t('common.language')}</label>
                <select
                  value={lecturerLanguage}
                  onChange={e => setLecturerLanguage(e.target.value)}
                >
                  <option value="en">{t('common.english')}</option>
                  <option value="fr">{t('common.french')}</option>
                </select>
              </div>
            )}

            <div className={styles.formGroup}>
              <small style={{ color: '#475569' }}>{t('registrationPage.candidateProgramNote')}</small>
            </div>

            <div className={styles.buttonGroup}>
              <button type="button" className={styles.buttonSecondary} onClick={handleBackStep}>
                ← {t('registrationPage.back') || 'Back'}
              </button>
              <button type="submit" className={styles.button}>
                {t('registrationPage.register') || 'Register'}
              </button>
            </div>
          </>
        )}
      </form>

      <p>
        {t('registrationPage.alreadyHaveAccount')}{' '}
        <Link to="/login" className={styles.link} onClick={triggerLinkLoading}>{t('registrationPage.login')}</Link>
      </p>
    </div>
  );
};

export default Registration;