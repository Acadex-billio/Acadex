import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import i18n, { resolveLanguageForUser } from './i18n';
import ToastNotification, { showToast } from './utility/ToastNotification';
import GraduationCapLoader from './components/GraduationCapLoader';
import { LoadingProvider, useLoading } from './context/LoadingContext';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import DeveloperRoute from './components/DeveloperRoute';
import LecturerRoute from './components/LecturerRoute';
import QuestionPapers from './components/QuestionPapers';
import ViewReports from './components/ViewReports';
import History from './components/History';
import Announcements from './components/Announcements';
import AdminAnnouncements from './components/AdminAnnouncements';
import AdminHistory from './components/AdminHistory';
import AdminShell from './components/layout/AdminShell';
import CandidateShell from './components/layout/CandidateShell';
import LecturerShell from './components/layout/LecturerShell';

const Home = lazy(() => import('./components/Home'));
const Login = lazy(() => import('./components/Login'));
const Registration = lazy(() => import('./components/Registration'));
const ResetPassword = lazy(() => import('./components/ResetPassword'));
const CandidateDashboard = lazy(() => import('./components/CandidateDashboard'));
const QuestionUpload = lazy(() => import('./components/QuestionUpload'));
const Department = lazy(() => import('./components/Department'));
const Profile = lazy(() => import('./components/Profile'));
const CandidateSubscriptions = lazy(() => import('./components/CandidateSubscriptions'));
const MyDownloads = lazy(() => import('./components/MyDownloads'));
const AdminInternshipTopics = lazy(() => import('./components/AdminInternshipTopics'));
const CandidateInternshipTopics = lazy(() => import('./components/CandidateInternshipTopics'));
const InternshipTopicDetail = lazy(() => import('./components/InternshipTopicDetail'));
const Settings = lazy(() => import('./components/Settings'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const ReportUpload = lazy(() => import('./components/ReportUpload'));
const UploadPresentation = lazy(() => import('./components/UploadPresentation'));
const ViewPresentation = lazy(() => import('./components/ViewPresentation'));
const GroupChat = lazy(() => import('./components/GroupChat')); 
const CandidateAccountStatus = lazy(() => import('./components/CandidateAccountStatus'));
const ManageCandidates = lazy(() => import('./components/ManageCandidates'));
const ManageUsers = lazy(() => import('./components/ManageUsers'));
const ManageBilling = lazy(() => import('./components/ManageBilling'));
const AIAssistant = lazy(() => import('./components/AI-Assistant'));
const AdminFeedback = lazy(() => import('./components/AdminFeedback'));
const CandidateFeedback = lazy(() => import('./components/CandidateFeedback'));
const AdminActivity = lazy(() => import('./components/AdminActivity'));
const CandidateActivity = lazy(() => import('./components/CandidateActivity'));
const Documentation = lazy(() => import('./components/Documentation'));
const TermsOfService = lazy(() => import('./components/TermsOfService'));
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy'));
const NotFound = lazy(() => import('./components/NotFound'));
const CandidateLecturers = lazy(() => import('./components/CandidateLecturers'));
const CandidateTutorshipBookings = lazy(() => import('./components/CandidateTutorshipBookings'));
const LecturerDashboard = lazy(() => import('./components/LecturerDashboard'));
const LecturerProfileVerification = lazy(() => import('./components/LecturerProfileVerification'));
const LecturerBookings = lazy(() => import('./components/LecturerBookings'));
const LecturerEarnings = lazy(() => import('./components/LecturerEarnings'));
const LecturerPendingApproval = lazy(() => import('./components/LecturerPendingApproval'));
const LecturerAdminPanel = lazy(() => import('./components/LecturerAdminPanel'));
const AdsManager = lazy(() => import('./components/AdsManager'));
const AdPerformanceReport = lazy(() => import('./components/AdPerformanceReport'));
const LecturerChatGate = lazy(() => import('./components/LecturerChatGate'));
const StudyModeMaterials = lazy(() => import('./components/StudyModeMaterials'));
const PaymentConfirmation = lazy(() => import('./components/PaymentConfirmation'));

const RouteLoadingListener = () => {
  const location = useLocation();
  const { startLoading, stopLoading } = useLoading();

  React.useEffect(() => {
    startLoading();
    let finished = false;
    const timer = setTimeout(() => {
      finished = true;
      stopLoading();
    }, 320);
    return () => {
      clearTimeout(timer);
      if (!finished) stopLoading();
    };
  }, [location.key, startLoading, stopLoading]);

  return null;
};

const LoaderOverlay = () => {
  const { loading } = useLoading();
  return loading ? <GraduationCapLoader fullscreen size={160} label="Loading... Please wait" /> : null;
};

const LanguageBootstrap = () => {
  const { user } = useAuth();

  React.useEffect(() => {
    if (!user?.cand_id) return;
    const nextLanguage = resolveLanguageForUser(user);
    if (nextLanguage && i18n.language !== nextLanguage) {
      i18n.changeLanguage(nextLanguage).catch(() => {});
    }
  }, [user]);

  return null;
};

const KeepaliveToast = () => {
  const { user } = useAuth();

  React.useEffect(() => {
    if (!user?.role || user.role !== 'developer') return undefined;

    let cancelled = false;
    const pingBackend = async () => {
      try {
        const response = await fetch('/api/health');
        if (cancelled) return;
        if (response.ok) {
          showToast('Your Backend is alive', 'info');
        }
      } catch (_err) {
        if (cancelled) return;
        showToast('Backend keepalive failed', 'warning');
      }
    };

    pingBackend();
    const interval = setInterval(pingBackend, 3 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user]);

  return null;
};

const App = () => (
  <ErrorBoundary>
    <LoadingProvider>
      <AuthProvider>
        <LanguageBootstrap />
        <Router>
          <ToastNotification />
          <KeepaliveToast />
          <LoaderOverlay />
          <RouteLoadingListener />
          <Suspense fallback={<GraduationCapLoader fullscreen size={160} label="Loading..." />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Registration />} />
              <Route path="/reset-password" element={<ResetPassword onClose={() => {}} />} />
              <Route path="/documentation" element={<Documentation />} />
              <Route path="/terms-of-service" element={<TermsOfService />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/load" element={<GraduationCapLoader fullscreen label="Loading materials…" />} />
              <Route path="/ai" element={<ProtectedRoute><AIAssistant /></ProtectedRoute>} />

              {/* Admin Shell - Protected with Admin Check */}
              <Route path="/admin" element={
                <ProtectedRoute>
                  <AdminRoute>
                    <AdminShell />
                  </AdminRoute>
                </ProtectedRoute>
              }>
                <Route index element={<AdminDashboard />} />
                <Route path="manage-candidates" element={<ManageCandidates />} />
                <Route path="manage-users" element={<ProtectedRoute><DeveloperRoute><ManageUsers /></DeveloperRoute></ProtectedRoute>} />
                <Route path="manage-billing" element={<ProtectedRoute><DeveloperRoute><ManageBilling /></DeveloperRoute></ProtectedRoute>} />
                <Route path="manage-admins" element={<Navigate to="/admin/manage-users" replace />} />
                <Route path="departments" element={<Department />} />
                <Route path="reports" element={<ReportUpload />} />
                <Route path="presentations" element={<UploadPresentation />} />
                <Route path="question-papers" element={<QuestionUpload />} />
                <Route path="chat" element={<GroupChat mode="admin" />} />
                <Route path="history" element={<AdminHistory />} />
                <Route path="feedback" element={<AdminFeedback />} />
                <Route path="activity" element={<AdminActivity />} />
                <Route path="announcements" element={<AdminAnnouncements />} />
                <Route path="internship-topics" element={<AdminInternshipTopics />} />
                <Route path="lecturers" element={<ProtectedRoute><DeveloperRoute><LecturerAdminPanel /></DeveloperRoute></ProtectedRoute>} />
                <Route path="ads" element={<ProtectedRoute><DeveloperRoute><AdsManager /></DeveloperRoute></ProtectedRoute>} />
                <Route path="ads/:adId/performance" element={<ProtectedRoute><DeveloperRoute><AdPerformanceReport /></DeveloperRoute></ProtectedRoute>} />
                <Route path="study-mode-materials" element={<ProtectedRoute><DeveloperRoute><StudyModeMaterials /></DeveloperRoute></ProtectedRoute>} />
                <Route path="ai-assistant" element={<AIAssistant />} />
                <Route path="profile" element={<Profile />} />
                <Route path="settings" element={<Settings />} />
              </Route>

              <Route path="/candidate/restricted" element={<ProtectedRoute><CandidateAccountStatus /></ProtectedRoute>} />
              <Route path="/lecturer/pending" element={<ProtectedRoute><LecturerPendingApproval /></ProtectedRoute>} />

              {/* Candidate Shell - Protected */}
              <Route path="/candidate" element={
                <ProtectedRoute>
                  <CandidateShell />
                </ProtectedRoute>
              }>
                <Route index element={<CandidateDashboard />} />
                <Route path="question-papers" element={<QuestionPapers />} />
                <Route path="downloads" element={<MyDownloads />} />
                <Route path="reports" element={<ViewReports />} />
                <Route path="presentations" element={<ViewPresentation />} />
                <Route path="announcements" element={<Announcements />} />
                <Route path="internship-topics" element={<CandidateInternshipTopics />} />
                <Route path="internship-topics/:topicId" element={<InternshipTopicDetail />} />
                <Route path="history" element={<History />} />
                <Route path="chat" element={<GroupChat mode="candidate" />} />
                <Route path="feedback" element={<CandidateFeedback />} />
                <Route path="activity" element={<CandidateActivity />} />
                <Route path="ai-assistant" element={<AIAssistant />} />
                <Route path="profile" element={<Profile />} />
                <Route path="subscription" element={<CandidateSubscriptions />} />
                <Route path="lecturers" element={<CandidateLecturers />} />
                <Route path="tutorship-bookings" element={<CandidateTutorshipBookings />} />
                <Route path="settings" element={<Settings />} />
                <Route path="account-status" element={<Navigate to="/candidate/restricted" replace />} />
              </Route>

              <Route path="/lecturer" element={
                <ProtectedRoute>
                  <LecturerRoute>
                    <LecturerShell />
                  </LecturerRoute>
                </ProtectedRoute>
              }>
                <Route index element={<LecturerDashboard />} />
                <Route path="profile-verification" element={<LecturerProfileVerification />} />
                <Route path="bookings" element={<LecturerBookings />} />
                <Route path="earnings" element={<LecturerEarnings />} />
                <Route path="chat" element={<LecturerChatGate />} />
                <Route path="history" element={<History />} />
                <Route path="ai-assistant" element={<AIAssistant />} />
                <Route path="profile" element={<Profile />} />
                <Route path="settings" element={<Settings />} />
              </Route>

              {/* Legacy route redirects */}
              <Route path="/admindash" element={<Navigate to="/admin" replace />} />
              <Route path="/dept" element={<Navigate to="/admin/departments" replace />} />
              <Route path="/upreport" element={<Navigate to="/admin/reports" replace />} />
              <Route path="/upresentation" element={<Navigate to="/admin/presentations" replace />} />
              <Route path="/question" element={<Navigate to="/admin/question-papers" replace />} />
              <Route path="/candash" element={<Navigate to="/candidate" replace />} />
              <Route path="/questionpapers" element={<Navigate to="/candidate/question-papers" replace />} />
              <Route path="/viewreports" element={<Navigate to="/candidate/reports" replace />} />
              <Route path="/viewpresentation" element={<Navigate to="/candidate/presentations" replace />} />
              <Route path="/notifications" element={<Navigate to="/candidate/announcements" replace />} />
              <Route path="/candidate/notifications" element={<Navigate to="/candidate/announcements" replace />} />
              <Route path="/viewhistory" element={<Navigate to="/candidate/history" replace />} />
              <Route path="/groupchat" element={<Navigate to="/candidate/chat" replace />} />
              <Route path="/can-profile" element={<Navigate to="/candidate/profile" replace />} />
              <Route path="/payment/confirmation" element={<PaymentConfirmation />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </Router>
      </AuthProvider>
    </LoadingProvider>
  </ErrorBoundary>
);

export default App;
