import React, { Suspense, lazy, useEffect, useState } from 'react';
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
import PushNotificationPromptModal from './components/PushNotificationPromptModal';
import QuestionPapers from './components/QuestionPapers';
import ViewReports from './components/ViewReports';
import History from './components/History';
import MyDownloads from './components/MyDownloads';
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
const CandidateEarnMoney = lazy(() => import('./components/CandidateEarnMoney'));
const AdminInternshipTopics = lazy(() => import('./components/AdminInternshipTopics'));
const CandidateInternshipTopics = lazy(() => import('./components/CandidateInternshipTopics'));
const InternshipTopicDetail = lazy(() => import('./components/InternshipTopicDetail'));
const Settings = lazy(() => import('./components/Settings'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const ReportUpload = lazy(() => import('./components/ReportUpload'));
const ReportWritingGuide = lazy(() => import('./components/ReportWritingGuide'));
const CandidateReportGuides = lazy(() => import('./components/CandidateReportGuides'));
const AdminPublishResults = lazy(() => import('./components/AdminPublishResults'));
const AdminFAQs = lazy(() => import('./components/AdminFAQs'));
const CandidateFAQs = lazy(() => import('./components/CandidateFAQs'));
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
const PageNotFound = lazy(() => import('./components/PageNotFound'));
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
const DeveloperCustomAlert = lazy(() => import('./components/DeveloperCustomAlert'));
const LecturerChatGate = lazy(() => import('./components/LecturerChatGate'));
const StudyModeMaterials = lazy(() => import('./components/StudyModeMaterials'));
const PaymentConfirmation = lazy(() => import('./components/PaymentConfirmation'));
const DeveloperProjectSubmissions = lazy(() => import('./components/DeveloperProjectSubmissions'));
const DeveloperPricing = lazy(() => import('./components/DeveloperPricing'));
const PurchaseHistory = lazy(() => import('./components/PurchaseHistory'));
const AccessGrantHistory = lazy(() => import('./components/AccessGrantHistory'));
const PermissionVerification = lazy(() => import('./components/PermissionVerification'));
const CandidateConcoursHub = lazy(() => import('./components/concours/CandidateConcoursHub'));
const ConcoursDetails = lazy(() => import('./components/concours/ConcoursDetails'));
const MyConcoursApplications = lazy(() => import('./components/concours/MyConcoursApplications'));
const ConcoursPartnerShell = lazy(() => import('./components/concours/ConcoursPartnerShell'));
const ConcoursPartnerDashboard = lazy(() => import('./components/concours/ConcoursPartnerDashboard'));
const ConcoursPartnerApplications = lazy(() => import('./components/concours/ConcoursPartnerApplications'));
const ConcoursPartnerManagement = lazy(() => import('./components/concours/ConcoursPartnerManagement'));
const ConcoursPartnerProfile = lazy(() => import('./components/concours/ConcoursPartnerProfile'));
const ConcoursFormBuilder = lazy(() => import('./components/concours/ConcoursFormBuilder'));
const DeveloperConcoursPartners = lazy(() => import('./components/concours/DeveloperConcoursPartners'));
const DeveloperConcoursManagement = lazy(() => import('./components/concours/DeveloperConcoursManagement'));

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

const App = () => {
  const [validationBanner, setValidationBanner] = useState(null);

  useEffect(() => {
    const handleValidationError = (event) => {
      const detail = event?.detail || {};
      setValidationBanner({
        message: detail.message || 'Please review the highlighted fields and try again.',
        errors: detail.errors || null,
      });
      if (typeof showToast === 'function') {
        showToast(detail.message || 'Please review the highlighted fields and try again.', 'warning');
      }
    };

    window.addEventListener('api-validation-error', handleValidationError);
    return () => {
      window.removeEventListener('api-validation-error', handleValidationError);
    };
  }, []);

  return (
    <ErrorBoundary>
      <LoadingProvider>
        <AuthProvider>
          <LanguageBootstrap />
          <Router>
            <ToastNotification />
            <LoaderOverlay />
            <PushNotificationPromptModal />
            <RouteLoadingListener />
            <Suspense fallback={<GraduationCapLoader fullscreen size={160} label="Loading..." />}>
              {validationBanner ? (
                <div
                  style={{
                    margin: '12px 16px 0',
                    border: '1px solid #f59e0b',
                    background: '#fff7ed',
                    color: '#9a2c00',
                    borderRadius: 12,
                    padding: '12px 14px',
                    fontSize: 14,
                    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>Please review the form</div>
                      <div>{validationBanner.message}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setValidationBanner(null)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: '#9a2c00',
                        fontSize: 18,
                        cursor: 'pointer',
                        lineHeight: 1,
                      }}
                      aria-label="Dismiss validation warning"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ) : null}

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
                  <Route path="manage-users" element={<ManageCandidates fixedRole="candidate" title="Candidate Management" />} />
                  <Route path="manage-users/candidates" element={<ManageCandidates fixedRole="candidate" title="Candidate Management" />} />
                  <Route path="manage-users/lecturers" element={<ManageCandidates fixedRole="lecturer" title="Lecturer Management" />} />
                  <Route path="manage-users/admins" element={<ProtectedRoute><DeveloperRoute><ManageUsers /></DeveloperRoute></ProtectedRoute>} />
                  <Route path="manage-users/concours-partners" element={<ProtectedRoute><DeveloperRoute><DeveloperConcoursPartners /></DeveloperRoute></ProtectedRoute>} />
                  <Route path="manage-candidates" element={<Navigate to="/admin/manage-users/candidates" replace />} />
                  <Route path="manage-billing" element={<ProtectedRoute><DeveloperRoute><ManageBilling /></DeveloperRoute></ProtectedRoute>} />
                  <Route path="purchase-history" element={<ProtectedRoute><DeveloperRoute><PurchaseHistory /></DeveloperRoute></ProtectedRoute>} />
                  <Route path="access-grant-history" element={<ProtectedRoute><DeveloperRoute><AccessGrantHistory /></DeveloperRoute></ProtectedRoute>} />
                  <Route path="permission-verification" element={<ProtectedRoute><DeveloperRoute><PermissionVerification /></DeveloperRoute></ProtectedRoute>} />
                  <Route path="manage-admins" element={<Navigate to="/admin/manage-users" replace />} />
                  <Route path="departments" element={<Department />} />
                  <Route path="reports" element={<ReportUpload />} />
                  <Route path="reports/writing-guide" element={<ReportWritingGuide />} />
                  <Route path="reports/publish-results" element={<AdminPublishResults />} />
                  <Route path="faqs" element={<AdminFAQs />} />
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
                  <Route path="project-submissions" element={<ProtectedRoute><DeveloperRoute><DeveloperProjectSubmissions /></DeveloperRoute></ProtectedRoute>} />
                  <Route path="pricing" element={<ProtectedRoute><DeveloperRoute><DeveloperPricing /></DeveloperRoute></ProtectedRoute>} />
                  <Route path="ai-assistant" element={<AIAssistant />} />
                  <Route path="profile" element={<Profile />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="custom-alert" element={<ProtectedRoute><DeveloperRoute><DeveloperCustomAlert /></DeveloperRoute></ProtectedRoute>} />
                  <Route path="concours/partners" element={<ProtectedRoute><DeveloperRoute><DeveloperConcoursPartners /></DeveloperRoute></ProtectedRoute>} />
                  <Route path="concours" element={<ProtectedRoute><DeveloperRoute><DeveloperConcoursManagement /></DeveloperRoute></ProtectedRoute>} />
                  <Route path="concours/:id/form" element={<ProtectedRoute><DeveloperRoute><ConcoursFormBuilder /></DeveloperRoute></ProtectedRoute>} />
                </Route>

                <Route path="/candidate/restricted" element={<ProtectedRoute><CandidateAccountStatus /></ProtectedRoute>} />
                <Route path="/candidate/internship-topics" element={<CandidateInternshipTopics />} />
                <Route path="/candidate/internship-topics/preview/:topicId" element={<InternshipTopicDetail previewMode />} />
                <Route path="/candidate/internship-topics/:topicId" element={<InternshipTopicDetail />} />
                <Route path="/lecturer/pending" element={<ProtectedRoute><LecturerPendingApproval /></ProtectedRoute>} />

                {/* Candidate Shell - Protected */}
                <Route path="/candidate" element={
                  <ProtectedRoute>
                    <CandidateShell />
                  </ProtectedRoute>
                }>
                  <Route index element={<CandidateDashboard />} />
                  <Route path="question-papers" element={<Navigate to="/candidate/question-papers/hnd" replace />} />
                  <Route path="question-papers/:paperType" element={<QuestionPapers />} />
                  <Route path="reports" element={<ViewReports />} />
                  <Route path="reports/guides" element={<CandidateReportGuides />} />
                  <Route path="faqs" element={<CandidateFAQs />} />
                  <Route path="reports/faqs" element={<Navigate to="/candidate/faqs" replace />} />
                  <Route path="results" element={<AdminPublishResults />} />
                  <Route path="presentations" element={<ViewPresentation />} />
                  <Route path="announcements" element={<Announcements />} />
                  <Route path="internship-topics" element={<CandidateInternshipTopics />} />
                  <Route path="internship-topics/:topicId" element={<InternshipTopicDetail />} />
                  <Route path="history" element={<MyDownloads />} />
                  <Route path="chat" element={<GroupChat mode="candidate" />} />
                  <Route path="feedback" element={<CandidateFeedback />} />
                  <Route path="activity" element={<CandidateActivity />} />
                  <Route path="ai-assistant" element={<AIAssistant />} />
                  <Route path="profile" element={<Profile />} />
                  <Route path="subscription" element={<CandidateSubscriptions />} />
                  <Route path="earn-money" element={<CandidateEarnMoney />} />
                  <Route path="lecturers" element={<CandidateLecturers />} />
                  <Route path="tutorship-bookings" element={<CandidateTutorshipBookings />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="concours" element={<CandidateConcoursHub />} />
                  <Route path="concours/:id" element={<ConcoursDetails />} />
                  <Route path="concours/applications" element={<MyConcoursApplications />} />
                  <Route path="account-status" element={<Navigate to="/candidate/restricted" replace />} />
                </Route>

                <Route path="/partner" element={<ProtectedRoute><ConcoursPartnerShell /></ProtectedRoute>}>
                  <Route index element={<ConcoursPartnerDashboard />} />
                  <Route path="concours" element={<ConcoursPartnerManagement />} />
                  <Route path="concours/manage" element={<ConcoursPartnerManagement />} />
                  <Route path="concours/:id/form" element={<ConcoursFormBuilder />} />
                  <Route path="applications" element={<ConcoursPartnerApplications />} />
                  <Route path="profile" element={<ConcoursPartnerProfile />} />
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
                <Route path="*" element={<PageNotFound />} />
              </Routes>
            </Suspense>
          </Router>
        </AuthProvider>
      </LoadingProvider>
    </ErrorBoundary>
  );
};

export default App;
