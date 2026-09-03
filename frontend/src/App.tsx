import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/AuthContext";
import { Layout } from "./components/Layout";
import { LoadingScreen } from "./components/ui";
import type { Role } from "./lib/types";

import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import RoleDashboard from "./pages/RoleDashboard";
import MyFundsPage from "./pages/MyFundsPage";
import FundDetailPage from "./pages/FundDetailPage";
import CreateFundPage from "./pages/superadmin/CreateFundPage";
import FortuneOrderPage from "./pages/FortuneOrderPage";
import FortuneWheelPage from "./pages/superadmin/FortuneWheelPage";
import PaymentsPage from "./pages/PaymentsPage";
import CollectionPage from "./pages/admin/CollectionPage";
import PayoutPage from "./pages/admin/PayoutPage";
import PayoutHistoryPage from "./pages/PayoutHistoryPage";
import TimelinePage from "./pages/TimelinePage";
import FundMembersPage from "./pages/FundMembersPage";
import { PaymentsChooser, FortuneChooser, CollectionChooser, PayoutChooser } from "./pages/Choosers";
import GlobalMembersPage from "./pages/superadmin/GlobalMembersPage";
import ReportsPage from "./pages/superadmin/ReportsPage";
import AuditLogsPage from "./pages/superadmin/AuditLogsPage";
import SettingsPage from "./pages/superadmin/SettingsPage";
import NotificationsPage from "./pages/NotificationsPage";
import ProfilePage from "./pages/ProfilePage";

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactElement }) {
  const { user } = useAuth();
  if (!user) return null;
  if (!roles.includes(user.role)) return <Navigate to="/app" replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={loading ? <LoadingScreen /> : user ? <Navigate to="/app" replace /> : <LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route
        path="/app"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<RoleDashboard />} />
        <Route path="funds" element={<MyFundsPage />} />
        <Route
          path="funds/new"
          element={
            <RequireRole roles={["SUPER_ADMIN"]}>
              <CreateFundPage />
            </RequireRole>
          }
        />
        <Route path="funds/:fundId" element={<FundDetailPage />} />
        <Route path="funds/:fundId/members" element={<FundMembersPage />} />
        <Route path="funds/:fundId/timeline" element={<TimelinePage />} />
        <Route path="funds/:fundId/fortune" element={<FortuneOrderPage />} />
        <Route
          path="funds/:fundId/fortune-wheel"
          element={
            <RequireRole roles={["SUPER_ADMIN"]}>
              <FortuneWheelPage />
            </RequireRole>
          }
        />
        <Route path="funds/:fundId/payments" element={<PaymentsPage />} />
        <Route
          path="funds/:fundId/collection"
          element={
            <RequireRole roles={["ADMIN", "SUPER_ADMIN"]}>
              <CollectionPage />
            </RequireRole>
          }
        />
        <Route
          path="funds/:fundId/payout"
          element={
            <RequireRole roles={["ADMIN", "SUPER_ADMIN"]}>
              <PayoutPage />
            </RequireRole>
          }
        />
        <Route path="funds/:fundId/payout-history" element={<PayoutHistoryPage />} />

        <Route path="payments" element={<PaymentsChooser />} />
        <Route path="fortune" element={<FortuneChooser />} />
        <Route
          path="collection"
          element={
            <RequireRole roles={["ADMIN", "SUPER_ADMIN"]}>
              <CollectionChooser />
            </RequireRole>
          }
        />
        <Route
          path="payout"
          element={
            <RequireRole roles={["ADMIN", "SUPER_ADMIN"]}>
              <PayoutChooser />
            </RequireRole>
          }
        />

        <Route
          path="members"
          element={
            <RequireRole roles={["SUPER_ADMIN"]}>
              <GlobalMembersPage />
            </RequireRole>
          }
        />
        <Route
          path="reports"
          element={
            <RequireRole roles={["SUPER_ADMIN"]}>
              <ReportsPage />
            </RequireRole>
          }
        />
        <Route
          path="audit-logs"
          element={
            <RequireRole roles={["SUPER_ADMIN"]}>
              <AuditLogsPage />
            </RequireRole>
          }
        />
        <Route
          path="settings"
          element={
            <RequireRole roles={["SUPER_ADMIN"]}>
              <SettingsPage />
            </RequireRole>
          }
        />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<Navigate to={user ? "/app" : "/login"} replace />} />
    </Routes>
  );
}
