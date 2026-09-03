import { useAuth } from "../lib/AuthContext";
import UserDashboard from "./user/UserDashboard";
import AdminDashboard from "./admin/AdminDashboard";
import SuperAdminDashboard from "./superadmin/SuperAdminDashboard";

export default function RoleDashboard() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === "SUPER_ADMIN") return <SuperAdminDashboard />;
  if (user.role === "ADMIN") return <AdminDashboard />;
  return <UserDashboard />;
}
