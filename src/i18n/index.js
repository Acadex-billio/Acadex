import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export const LANGUAGE_STORAGE_KEY = 'app_language';
export const PROGRAM_LANGUAGE_MAP = {
  HND: 'en',
  BTS: 'fr',
};

export const resolveLanguageForUser = (user) => {
  const preferred = String(user?.preferred_language || '').trim().toLowerCase();
  if (preferred === 'en' || preferred === 'fr') return preferred;

  const program = String(user?.program || '').trim().toUpperCase();
  if (PROGRAM_LANGUAGE_MAP[program]) return PROGRAM_LANGUAGE_MAP[program];

  return 'en';
};

export const getStoredLanguage = () => {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === 'en' || stored === 'fr') return stored;
  } catch (_) {
    // ignore storage access failures
  }
  return 'en';
};

const resources = {
  en: {
    translation: {
      common: {
        home: 'Home',
        about: 'About',
        terms: 'Terms',
        privacy: 'Privacy',
        signIn: 'Sign in',
        language: 'Language',
        program: 'Program',
        english: 'English',
        french: 'French',
        hnd: 'HND',
        bts: 'BTS',
        loading: 'Loading...',
        save: 'Save',
        cancel: 'Cancel',
        upload: 'Upload',
        update: 'Update',
        active: 'Active',
        suspended: 'Suspended',
        blocked: 'Blocked',
      },
      nav: {
        dashboard: 'Dashboard',
        manageCandidates: 'Manage Candidates',
        manageUsers: 'Manage Users',
        departments: 'Departments',
        reports: 'Reports',
        presentations: 'Presentations',
        questionPapers: 'Question Papers',
        chat: 'Chat',
        feedback: 'Feedback',
        activity: 'Activity',
        announcements: 'Announcements',
        internshipTopics: 'Internship Topics',
        history: 'History',
        aiAssistant: 'AI Assistant',
        aiKnowledge: 'AI Knowledge',
        profile: 'Profile',
        subscriptions: 'Subscriptions',
        settings: 'Settings',
        logout: 'Logout',
        navigation: 'Navigation',
        adminPanel: 'Admin Panel',
        candidateDashboard: 'Candidate Dashboard',
        admin: 'Admin',
        candidate: 'Candidate',
      },
      manageUsers: {
        title: 'Manage Users',
        subtitle: 'Manage candidate and admin accounts in one place.',
        candidates: 'Candidates',
        admins: 'Admins',
        allPrograms: 'All programs',
        allStatus: 'All status',
        searchPlaceholder: 'Search by name / ID / email',
        noCandidates: 'No candidates found.',
        noAdmins: 'No admins found.',
        userDetails: 'User details',
        roleLabel: 'Role',
        programLabel: 'Program',
        departmentLabel: 'Department',
        emailLabel: 'Email',
        phoneLabel: 'Phone',
        promoteAdmin: 'Promote to Admin',
        demoteCandidate: 'Demote to Candidate',
      },
      toastTitle: {
        success: 'Success',
        error: 'Error',
        warning: 'Warning',
        info: 'Information',
      },
      toast: {
        role: {
          promoted: 'User promoted to admin successfully.',
          demoted: 'User demoted to candidate successfully.',
        },
        auth: {
          required: 'Authentication required',
          adminRequired: 'Admin access required',
          developerRequired: 'Developer access required',
        },
        admin: {
          accountStatus: 'Admin account is {{status}}',
        },
        candidate: {
          accountStatus: 'Your account is {{status}}.',
        },
        sessionExpired: 'Your session has expired. Please log in again.',
        accessDenied: 'Access denied for this resource. Please contact the administrator.',
        tooManyChecks: 'Too many auth checks too quickly; please wait a few seconds.',
        loginSuccess: 'Login successful! Redirecting...',
        settings: {
          updated: 'Settings updated',
          languageUpdated: 'Language updated',
          notificationsUpdated: 'Notification settings updated',
        },
        registration: {
          departmentsLoadFailed: 'Failed to load departments',
          success: 'Registration successful! Redirecting to login...',
        },
        download: {
          started: 'Download started',
        },
        upload: {
          success: 'Uploaded successfully.',
        },
      },
      homePage: {
        brand: 'Acadex',
        title: 'Welcome to the Acadex',
        description: 'Access verified HND and BTS past questions, reports, and internship topics in one place.',
        accessButton: 'Login/Register to Access Materials',
        accessNote: 'Access is restricted to registered students.',
        learnMore: 'Learn More',
        metricsStudents: '500+ Students using the platform',
        metricsMaterials: '1,000+ Materials available',
        metricsTrusted: 'Trusted by HND BOARD YAOUNDE',
        pastPapers: 'Past Question Papers',
        reports: 'Detailed Reports',
        topics: 'Internship Topics',
        aboutPlatform: 'About Acadex',
      },
      loginPage: {
        title: 'Login - Acadex',
        backHome: 'Back to Home',
        heading: 'Let the Journey Begin!',
        subtitle: 'Unlock a world of education with a single click.',
        email: 'Email Address',
        emailPlaceholder: 'example@email.com',
        password: 'Password',
        passwordPlaceholder: '********',
        login: 'Login',
        forgotPassword: 'Forgot Password?',
        noAccount: 'Don’t have an account?',
        signUpFree: 'Sign Up For Free',
      },
      registrationPage: {
        title: 'Register - Acadex',
        heading: 'Register',
        personalDetails: 'PersonalDetails',
        schoolDetails: 'SchoolDetails',
        name: 'Name',
        department: 'Department',
        selectDepartment: '-- Select Department --',
        email: 'Email',
        phone: 'Phone Number',
        password: 'Password',
        confirmPassword: 'Confirm Password',
        register: 'Register',
        alreadyHaveAccount: 'Already have an account?',
        login: 'Login',
        candidateProgramNote: 'Your default language follows your program: HND uses English, BTS uses French.',
      },
      settingsPage: {
        title: 'Settings',
        subtitle: 'Preferences and system options',
        account: 'Account',
        accountStatus: 'Account status',
        activeCandidate: 'Active Candidate',
        appearance: 'Appearance',
        theme: 'Theme',
        themeSubtitle: 'Switch between light and dark mode',
        notifications: 'Notifications',
        allowEmails: 'Allow emails',
        allowEmailsSubtitle: 'Receive system updates and notifications via email',
        pushNotifications: 'Push notifications',
        pushNotificationsSubtitle: 'Receive browser push notifications. If sound autoplay is blocked, system notification sound is used.',
        toastSound: 'Toast sound',
        toastSoundSubtitle: 'Play a sound when toast notifications appear.',
        profileLanguage: 'Preferred language',
        profileLanguageSubtitle: 'Choose the language used by the interface for your account.',
        programSubtitle: 'Your account program controls content access across the platform.',
      },
      uploads: {
        reportProgramLabel: 'Program',
        reportUploadTitle: 'Upload Report',
        reportUpdateTitle: 'Update Report',
        presentationUploadTitle: 'Upload Presentation',
        presentationUpdateTitle: 'Update Presentation',
        questionUploadTitle: 'Upload Question Paper',
        questionUpdateTitle: 'Update Question Paper',
      },
    },
  },
  fr: {
    translation: {
      common: {
        home: 'Accueil',
        about: 'A propos',
        terms: 'Conditions',
        privacy: 'Confidentialite',
        signIn: 'Connexion',
        language: 'Langue',
        program: 'Programme',
        english: 'Anglais',
        french: 'Francais',
        hnd: 'HND',
        bts: 'BTS',
        loading: 'Chargement...',
        save: 'Enregistrer',
        cancel: 'Annuler',
        upload: 'Televerser',
        update: 'Mettre a jour',
        active: 'Actif',
        suspended: 'Suspendu',
        blocked: 'Bloque',
      },
      nav: {
        dashboard: 'Tableau de bord',
        manageCandidates: 'Gerer les candidats',
        manageUsers: 'Gerer les utilisateurs',
        departments: 'Departements',
        reports: 'Rapports',
        presentations: 'Presentations',
        questionPapers: 'Anciennes epreuves',
        chat: 'Discussion',
        feedback: 'Retours',
        activity: 'Activite',
        announcements: 'Annonces',
        internshipTopics: 'Sujets de stage',
        history: 'Historique',
        aiAssistant: 'Assistant IA',
        aiKnowledge: 'Connaissance IA',
        profile: 'Profil',
        subscriptions: 'Abonnements',
        settings: 'Parametres',
        logout: 'Deconnexion',
        navigation: 'Navigation',
        adminPanel: 'Panneau administrateur',
        candidateDashboard: 'Tableau de bord candidat',
        admin: 'Administrateur',
        candidate: 'Candidat',
      },
      manageUsers: {
        title: 'Gerer les utilisateurs',
        subtitle: 'Gerez les comptes candidats et administrateurs au meme endroit.',
        candidates: 'Candidats',
        admins: 'Administrateurs',
        allPrograms: 'Tous les programmes',
        allStatus: 'Tous les statuts',
        searchPlaceholder: 'Rechercher par nom / ID / email',
        noCandidates: 'Aucun candidat trouve.',
        noAdmins: 'Aucun administrateur trouve.',
        userDetails: 'Details utilisateur',
        roleLabel: 'Role',
        programLabel: 'Programme',
        departmentLabel: 'Departement',
        emailLabel: 'Email',
        phoneLabel: 'Telephone',
        promoteAdmin: 'Promouvoir administrateur',
        demoteCandidate: 'Retrograder candidat',
      },
      toastTitle: {
        success: 'Succes',
        error: 'Erreur',
        warning: 'Avertissement',
        info: 'Information',
      },
      toast: {
        role: {
          promoted: 'Utilisateur promu administrateur avec succes.',
          demoted: 'Utilisateur retrograde candidat avec succes.',
        },
        auth: {
          required: 'Authentification requise',
          adminRequired: 'Acces administrateur requis',
          developerRequired: 'Acces developpeur requis',
        },
        admin: {
          accountStatus: 'Le compte administrateur est {{status}}',
        },
        candidate: {
          accountStatus: 'Votre compte est {{status}}.',
        },
        sessionExpired: 'Votre session a expire. Veuillez vous reconnecter.',
        accessDenied: 'Acces refuse a cette ressource. Contactez l administrateur.',
        tooManyChecks: 'Trop de verifications d authentification; veuillez patienter quelques secondes.',
        loginSuccess: 'Connexion reussie ! Redirection...',
        settings: {
          updated: 'Parametres mis a jour',
          languageUpdated: 'Langue mise a jour',
          notificationsUpdated: 'Parametres de notification mis a jour',
        },
        registration: {
          departmentsLoadFailed: 'Echec du chargement des departements',
          success: 'Inscription reussie ! Redirection vers la connexion...',
        },
        download: {
          started: 'Telechargement demarre',
        },
        upload: {
          success: 'Televersement reussi.',
        },
      },
      homePage: {
        brand: 'Acadex',
        title: 'Bienvenue sur la Acadex',
        description: 'Accedez aux anciennes epreuves, rapports et sujets de stage HND et BTS au meme endroit.',
        accessButton: 'Se connecter / S’inscrire pour acceder aux ressources',
        accessNote: 'L’acces est reserve aux etudiants inscrits.',
        learnMore: 'En savoir plus',
        metricsStudents: '500+ etudiants utilisent la plateforme',
        metricsMaterials: '1 000+ ressources disponibles',
        metricsTrusted: 'Approuvee par le HND BOARD YAOUNDE',
        pastPapers: 'Anciennes epreuves',
        reports: 'Rapports detailles',
        topics: 'Sujets de stage',
        aboutPlatform: 'A propos de la Acadex',
      },
      loginPage: {
        title: 'Connexion - Acadex',
        backHome: 'Retour a l’accueil',
        heading: 'Commencez votre parcours !',
        subtitle: 'Debloquez un monde educatif en un seul clic.',
        email: 'Adresse email',
        emailPlaceholder: 'exemple@email.com',
        password: 'Mot de passe',
        passwordPlaceholder: '********',
        login: 'Connexion',
        forgotPassword: 'Mot de passe oublie ?',
        noAccount: 'Vous n’avez pas de compte ?',
        signUpFree: 'Inscrivez-vous gratuitement',
      },
      registrationPage: {
        title: 'Inscription - Acadex',
        heading: 'Inscription',        personalDetails: 'Informations personnelles',
        schoolDetails: 'Détails scolaires',        name: 'Nom',
        department: 'Departement',
        selectDepartment: '-- Selectionner un departement --',
        email: 'Email',
        phone: 'Numero de telephone',
        password: 'Mot de passe',
        confirmPassword: 'Confirmer le mot de passe',
        register: 'S’inscrire',
        alreadyHaveAccount: 'Vous avez deja un compte ?',
        login: 'Connexion',
        candidateProgramNote: 'La langue par defaut suit votre programme : HND utilise l’anglais, BTS utilise le francais.',
      },
      settingsPage: {
        title: 'Parametres',
        subtitle: 'Preferences et options du systeme',
        account: 'Compte',
        accountStatus: 'Statut du compte',
        activeCandidate: 'Candidat actif',
        appearance: 'Apparence',
        theme: 'Theme',
        themeSubtitle: 'Basculer entre le mode clair et sombre',
        notifications: 'Notifications',
        allowEmails: 'Autoriser les emails',
        allowEmailsSubtitle: 'Recevoir les mises a jour systeme et notifications par email',
        pushNotifications: 'Notifications push',
        pushNotificationsSubtitle: 'Recevoir les notifications push du navigateur. Si l’autoplay audio est bloque, un son systeme est utilise.',
        toastSound: 'Son des notifications toast',
        toastSoundSubtitle: 'Jouer un son lorsque les notifications toast apparaissent.',
        profileLanguage: 'Langue preferee',
        profileLanguageSubtitle: 'Choisissez la langue utilisee par l’interface pour votre compte.',
        programSubtitle: 'Votre programme de compte controle l’acces au contenu sur toute la plateforme.',
      },
      uploads: {
        reportProgramLabel: 'Programme',
        reportUploadTitle: 'Televerser un rapport',
        reportUpdateTitle: 'Mettre a jour le rapport',
        presentationUploadTitle: 'Televerser une presentation',
        presentationUpdateTitle: 'Mettre a jour la presentation',
        questionUploadTitle: 'Televerser une ancienne epreuve',
        questionUpdateTitle: 'Mettre a jour l’epreuve',
      },
    },
  },
};

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: getStoredLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });
}

i18n.on('languageChanged', (language) => {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch (_) {
    // ignore storage access failures
  }
  document.documentElement.lang = language;
});

document.documentElement.lang = i18n.language || 'en';

export default i18n;