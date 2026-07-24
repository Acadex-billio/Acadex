import React from 'react';
import styles from '../Astyles/AcademicHero.module.css';

const AcademicHeroIllustration = () => {
  return (
    <div className={styles.heroContainer}>
      {/* SVG Background Illustration */}
      <svg
        className={styles.illustration}
        viewBox="0 0 800 1000"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Gradient Definitions */}
        <defs>
          <linearGradient id="skyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#2d9f6f" />
            <stop offset="50%" stopColor="#39b581" />
            <stop offset="100%" stopColor="#4ade80" />
          </linearGradient>

          <radialGradient id="glowGreen" cx="50%" cy="50%" r="40%">
            <stop offset="0%" stopColor="#86efac" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
          </radialGradient>

          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="shadowFilter">
            <feDropShadow dx="2" dy="2" stdDeviation="3" floodOpacity="0.3" />
          </filter>
        </defs>

        {/* Background */}
        <rect width="800" height="1000" fill="url(#skyGradient)" />

        {/* Grid Pattern Background */}
        <g opacity="0.1" stroke="#4ade80" strokeWidth="1">
          <line x1="0" y1="200" x2="800" y2="200" />
          <line x1="0" y1="400" x2="800" y2="400" />
          <line x1="0" y1="600" x2="800" y2="600" />
          <line x1="0" y1="800" x2="800" y2="800" />
          <line x1="200" y1="0" x2="200" y2="1000" />
          <line x1="400" y1="0" x2="400" y2="1000" />
          <line x1="600" y1="0" x2="600" y2="1000" />
        </g>

        {/* ACADEX LOGO WATERMARK - TOP */}
        <g opacity="0.25">
          <text x="400" y="80" fontSize="48" fontWeight="900" fill="#ffffff" textAnchor="middle" letterSpacing="2">
            ACADEX
          </text>
          <line x1="250" y1="95" x2="550" y2="95" stroke="#86efac" strokeWidth="2" />
        </g>

        {/* ANIMATED BACKGROUND ELEMENTS */}
        
        {/* Floating/Drifting Degree Text */}
        <g className={styles.animFloat1} opacity="0.45">
          <text x="100" y="200" fontSize="36" fontWeight="bold" fill="#ffffff" textAnchor="middle">
            HND
          </text>
        </g>

        <g className={styles.animDrift1} opacity="0.42">
          <text x="700" y="150" fontSize="32" fontWeight="bold" fill="#ffffff" textAnchor="middle">
            BTS
          </text>
        </g>

        <g className={styles.animFloat2} opacity="0.44">
          <text x="150" y="700" fontSize="28" fontWeight="bold" fill="#ffffff" textAnchor="middle">
            LICENCE
          </text>
        </g>

        <g className={styles.animDrift2} opacity="0.42">
          <text x="680" y="600" fontSize="30" fontWeight="bold" fill="#ffffff" textAnchor="middle">
            BSS
          </text>
        </g>

        <g className={styles.animFloat3} opacity="0.43">
          <text x="400" y="120" fontSize="26" fontWeight="bold" fill="#ffffff" textAnchor="middle">
            BTECH
          </text>
        </g>

        <g className={styles.animDrift3} opacity="0.41">
          <text x="150" y="400" fontSize="28" fontWeight="bold" fill="#ffffff" textAnchor="middle">
            BBA
          </text>
        </g>

        <g className={styles.animOrbit1} opacity="0.44">
          <text x="600" y="300" fontSize="30" fontWeight="bold" fill="#ffffff" textAnchor="middle">
            MBA
          </text>
        </g>

        <g className={styles.animFloat1} opacity="0.42" style={{animationDelay: '0.2s'}}>
          <text x="300" y="850" fontSize="32" fontWeight="bold" fill="#ffffff" textAnchor="middle">
            MTECH
          </text>
        </g>

        <g className={styles.animDrift1} opacity="0.43" style={{animationDelay: '0.4s'}}>
          <text x="550" y="900" fontSize="28" fontWeight="bold" fill="#ffffff" textAnchor="middle">
            MSC
          </text>
        </g>

        <g className={styles.animOrbit2} opacity="0.42">
          <text x="100" y="550" fontSize="34" fontWeight="bold" fill="#ffffff" textAnchor="middle">
            PHD
          </text>
        </g>

        <g className={styles.animFloat2} opacity="0.41" style={{animationDelay: '0.3s'}}>
          <text x="700" y="450" fontSize="26" fontWeight="bold" fill="#ffffff" textAnchor="middle">
            PHT
          </text>
        </g>

        <g className={styles.animSlowDrift} opacity="0.48">
          <text x="350" y="300" fontSize="36" fontWeight="bold" fill="#ffffff" textAnchor="middle">
            SUCCESS
          </text>
        </g>

        <g className={styles.animSlowFloat} opacity="0.46">
          <text x="600" y="750" fontSize="32" fontWeight="bold" fill="#ffffff" textAnchor="middle">
            FORWARD
          </text>
        </g>

        {/* Animated Graduation Caps */}
        <g className={styles.animFloat1} opacity="0.55">
          <circle cx="200" cy="250" r="15" fill="#ffffff" />
          <polygon points="200,250 170,230 180,220 200,230 220,220 230,230" fill="#1f2937" />
          <line x1="200" y1="265" x2="220" y2="285" stroke="#fbbf24" strokeWidth="2" />
        </g>

        <g className={styles.animDrift2} opacity="0.52">
          <circle cx="650" cy="350" r="14" fill="#ffffff" />
          <polygon points="650,350 622,332 631,323 650,333 669,323 678,332" fill="#1f2937" />
          <line x1="650" y1="364" x2="668" y2="382" stroke="#fbbf24" strokeWidth="2" />
        </g>

        <g className={styles.animOrbit1} opacity="0.50">
          <circle cx="300" cy="600" r="13" fill="#ffffff" />
          <polygon points="300,600 273,583 281,575 300,585 319,575 327,583" fill="#1f2937" />
          <line x1="300" y1="613" x2="317" y2="630" stroke="#fbbf24" strokeWidth="2" />
        </g>

        <g className={styles.animFloat3} opacity="0.51">
          <circle cx="550" cy="200" r="12" fill="#ffffff" />
          <polygon points="550,200 524,185 532,177 550,187 568,177 576,185" fill="#1f2937" />
          <line x1="550" y1="212" x2="566" y2="228" stroke="#fbbf24" strokeWidth="2" />
        </g>
        <circle cx="100" cy="150" r="60" fill="url(#glowGreen)" filter="url(#glow)" />
        <circle cx="700" cy="800" r="80" fill="url(#glowGreen)" filter="url(#glow)" />
        <circle cx="600" cy="200" r="50" fill="url(#glowGreen)" opacity="0.3" filter="url(#glow)" />

        {/* FUTURISTIC CAMPUS BUILDING */}
        {/* Main Building */}
        <rect x="250" y="500" width="300" height="300" fill="#1e40af" opacity="0.8" filter="url(#shadowFilter)" />
        <line x1="250" y1="550" x2="550" y2="550" stroke="#4ade80" strokeWidth="2" />
        <line x1="250" y1="600" x2="550" y2="600" stroke="#4ade80" strokeWidth="2" />
        <line x1="250" y1="650" x2="550" y2="650" stroke="#4ade80" strokeWidth="2" />
        <line x1="250" y1="700" x2="550" y2="700" stroke="#4ade80" strokeWidth="2" />

        {/* Windows with glow */}
        <g fill="#4ade80" opacity="0.7" filter="url(#glow)">
          <rect x="280" y="520" width="30" height="30" />
          <rect x="330" y="520" width="30" height="30" />
          <rect x="380" y="520" width="30" height="30" />
          <rect x="430" y="520" width="30" height="30" />
          <rect x="480" y="520" width="30" height="30" />

          <rect x="280" y="570" width="30" height="30" />
          <rect x="330" y="570" width="30" height="30" />
          <rect x="380" y="570" width="30" height="30" />
          <rect x="430" y="570" width="30" height="30" />
          <rect x="480" y="570" width="30" height="30" />

          <rect x="280" y="620" width="30" height="30" />
          <rect x="330" y="620" width="30" height="30" />
          <rect x="380" y="620" width="30" height="30" />
          <rect x="430" y="620" width="30" height="30" />
          <rect x="480" y="620" width="30" height="30" />
        </g>

        {/* FLOATING BOOKS */}
        {/* Book 1 */}
        <rect x="120" y="250" width="60" height="80" fill="#dc2626" opacity="0.8" transform="rotate(-15 150 290)" filter="url(#shadowFilter)" />
        <line x1="120" y1="260" x2="180" y2="260" stroke="#fca5a5" strokeWidth="1.5" transform="rotate(-15 150 290)" />

        {/* Book 2 */}
        <rect x="650" y="350" width="60" height="80" fill="#2563eb" opacity="0.8" transform="rotate(20 680 390)" filter="url(#shadowFilter)" />
        <line x1="650" y1="360" x2="710" y2="360" stroke="#93c5fd" strokeWidth="1.5" transform="rotate(20 680 390)" />

        {/* Book 3 */}
        <rect x="200" y="150" width="50" height="70" fill="#7c3aed" opacity="0.7" transform="rotate(-25 225 185)" filter="url(#shadowFilter)" />

        {/* GRADUATION CAP */}
        <g transform="translate(550, 200)">
          <circle cx="0" cy="0" r="35" fill="#1f2937" opacity="0.9" />
          <polygon points="0,-35 -60,-50 -50,-70 0,-60 50,-70 60,-50" fill="#1f2937" opacity="0.9" />
          <line x1="0" y1="0" x2="45" y2="45" stroke="#fbbf24" strokeWidth="3" />
          <circle cx="50" cy="50" r="8" fill="#fbbf24" opacity="0.8" filter="url(#glow)" />
        </g>

        {/* RESEARCH GRAPHS */}
        {/* Graph 1 - Ascending */}
        <g opacity="0.7">
          <polyline points="100,450 130,420 160,400 190,350 220,280 250,220" stroke="#4ade80" strokeWidth="2" fill="none" filter="url(#glow)" />
          <circle cx="100" cy="450" r="3" fill="#4ade80" />
          <circle cx="130" cy="420" r="3" fill="#4ade80" />
          <circle cx="160" cy="400" r="3" fill="#4ade80" />
          <circle cx="190" cy="350" r="3" fill="#4ade80" />
          <circle cx="220" cy="280" r="3" fill="#4ade80" />
          <circle cx="250" cy="220" r="3" fill="#4ade80" />
        </g>

        {/* FLOATING AI HOLOGRAM */}
        <g opacity="0.6" filter="url(#glow)">
          <circle cx="350" cy="250" r="40" fill="none" stroke="#4ade80" strokeWidth="2" />
          <circle cx="350" cy="250" r="50" fill="none" stroke="#4ade80" strokeWidth="1" opacity="0.5" />
          <circle cx="350" cy="250" r="60" fill="none" stroke="#4ade80" strokeWidth="1" opacity="0.3" />
          {/* Center dot */}
          <circle cx="350" cy="250" r="5" fill="#4ade80" />
          {/* Radiating lines */}
          <line x1="350" y1="190" x2="350" y2="170" stroke="#4ade80" strokeWidth="2" />
          <line x1="390" y1="290" x2="405" y2="305" stroke="#4ade80" strokeWidth="2" />
          <line x1="310" y1="290" x2="295" y2="305" stroke="#4ade80" strokeWidth="2" />
        </g>

        {/* STUDENTS COLLABORATING - Simple figures */}
        <g opacity="0.6">
          {/* Student 1 */}
          <circle cx="420" cy="370" r="12" fill="#f87171" />
          <rect x="415" y="385" width="10" height="25" fill="#f87171" />

          {/* Student 2 */}
          <circle cx="470" cy="375" r="12" fill="#60a5fa" />
          <rect x="465" y="390" width="10" height="25" fill="#60a5fa" />

          {/* Connection line - collaboration */}
          <line x1="430" y1="380" x2="460" y2="385" stroke="#4ade80" strokeWidth="2" opacity="0.8" filter="url(#glow)" />
        </g>

        {/* CAMEROON FLAG - Subtle in corner */}
        <g opacity="0.15">
          <rect x="30" y="900" width="60" height="40" fill="#007A5E" />
          <rect x="50" y="900" width="40" height="40" fill="#FFFFFF" />
          <rect x="70" y="900" width="20" height="40" fill="#CE1126" />
          <circle cx="60" cy="920" r="5" fill="#FCD116" />
        </g>

        {/* Digital Library Elements */}
        <g opacity="0.5" stroke="#4ade80" strokeWidth="1" fill="none">
          <rect x="600" y="420" width="150" height="100" />
          <line x1="600" y1="440" x2="750" y2="440" />
          <line x1="600" y1="460" x2="750" y2="460" />
          <line x1="600" y1="480" x2="750" y2="480" />
          <line x1="600" y1="500" x2="750" y2="500" />
        </g>
      </svg>

      {/* OVERLAY CONTENT */}
      <div className={styles.overlayContent}>
        {/* ACADEX LOGO IMAGE */}
        <div className={styles.logoContainer}>
          <img src={process.env.PUBLIC_URL + '/acadex-logo.png'} alt="Acadex Logo" className={styles.logoImage} />
        </div>

        <h2 className={styles.mainHeading}>
          One Platform. <br /> Endless Academic <br /> Possibilities.
        </h2>

        <div className={styles.featuresList}>
          <div className={styles.featureItem}>
            <span className={styles.checkmark}>✓</span>
            <span>Past Questions</span>
          </div>
          <div className={styles.featureItem}>
            <span className={styles.checkmark}>✓</span>
            <span>Projects</span>
          </div>
          <div className={styles.featureItem}>
            <span className={styles.checkmark}>✓</span>
            <span>AI Assistant</span>
          </div>
          <div className={styles.featureItem}>
            <span className={styles.checkmark}>✓</span>
            <span>Lecture Notes</span>
          </div>
          <div className={styles.featureItem}>
            <span className={styles.checkmark}>✓</span>
            <span>Research</span>
          </div>
          <div className={styles.featureItem}>
            <span className={styles.checkmark}>✓</span>
            <span>Institutions</span>
          </div>
        </div>

        <div className={styles.disclaimer}>
          <strong>⚠️ Study Purpose:</strong> Materials on this system are meant for study purposes only.
          <div>
            <a href="/terms" className={styles.termsLink}>Read our Terms</a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AcademicHeroIllustration;
