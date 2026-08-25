import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import styles from '../../Astyles/Concours.module.css';

export default function CandidateConcoursHub() {
  const [items, setItems] = useState([]); const [q, setQ] = useState(''); const [loading, setLoading] = useState(true);
  useEffect(() => { let live = true; api.get('/concours', { params: { q, page: 1, limit: 20 } }).then((res) => { if (live) setItems(res.data.items || []); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [q]);
  return <div className={styles.page}><header className={styles.header}><div><div className={styles.eyebrow}>ACADEX opportunities</div><h1 className={styles.title}>Concours Hub</h1><p className={styles.subtitle}>Discover opportunities available to every ACADEX candidate.</p></div><div className={styles.actions}><Link className={`${styles.button} ${styles.buttonSecondary}`} to="/candidate/concours/applications">My Applications</Link></div></header><input className={styles.search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search concours" aria-label="Search concours" />{loading ? <p>Loading concours...</p> : items.length ? <div className={styles.grid}>{items.map((item) => <article key={item._id} className={styles.card}><div className={styles.cardMeta}>{item.organizationName} · {item.category}</div><h2 className={styles.cardTitle}>{item.title}</h2><p className={styles.cardText}>{item.shortDescription}</p><p className={styles.cardMeta}>Deadline: {new Date(item.closingDate).toLocaleDateString()}</p><Link className={styles.button} to={`/candidate/concours/${item._id}`}>View details</Link></article>)}</div> : <p className={styles.empty}>No active concours found.</p>}</div>;
}
