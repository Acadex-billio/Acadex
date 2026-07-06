import React, { useEffect, useRef, useState } from 'react';
import { FaEllipsisV } from 'react-icons/fa';
import styles from '../Astyles/ManageBilling.module.css';
import BillingPlans from './BillingPlans';
import BillingHistory from './BillingHistory';
import BillingCoupons from './BillingCoupons';
import BillingAccessGrantModal from './BillingAccessGrantModal';

const TABS = [
  { id: 'plans', label: 'User Plans' },
  { id: 'history', label: 'Purchase History' },
  { id: 'coupons', label: 'Coupons' },
];

const ManageBilling = () => {
  const [activeTab, setActiveTab] = useState('plans');
  const [menuOpen, setMenuOpen] = useState(false);
  const [accessModalOpen, setAccessModalOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Manage Billing</h1>
          <p className={styles.subtitle}>Keep the current billing experience under User Plans and manage history or coupons from one place.</p>
        </div>
        <div className={styles.menuWrapper} ref={menuRef}>
          <button
            type="button"
            className={styles.menuButton}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            <FaEllipsisV size={18} />
          </button>
          {menuOpen && (
            <div className={styles.menuDropdown} role="menu">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`${styles.menuItem} ${activeTab === tab.id ? styles.menuItemActive : ''}`}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setMenuOpen(false);
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={styles.sectionTabs}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`${styles.tabButton} ${activeTab === tab.id ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.sectionContent}>
        {activeTab === 'plans' && <BillingPlans />}
        {activeTab === 'history' && <BillingHistory onCreateAccess={() => setAccessModalOpen(true)} />}
        {activeTab === 'coupons' && <BillingCoupons />}
      </div>

      <BillingAccessGrantModal open={accessModalOpen} onClose={() => setAccessModalOpen(false)} />
    </div>
  );
};

export default ManageBilling;
