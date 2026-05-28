import React from 'react';
import styles from '../Astyles/AnalyticsGraph.module.css';

const CandidateGraph = () => {
    return (
        <div className={styles.graphContainer}>
            <h2>User Interaction Analytics</h2>
            <div className={styles.graphPlaceholder}>Graph goes here</div>
        </div>
    );
};

export default CandidateGraph;