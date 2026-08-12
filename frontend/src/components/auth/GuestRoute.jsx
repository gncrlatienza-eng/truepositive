import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

// Inverse of ProtectedRoute: keeps already-authenticated users off
// signed-out-only screens (login, signup) instead of showing them a
// form that will just fail (e.g. signup 409-ing on their own email).
export default function GuestRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return null;
  if (isAuthenticated) return <Navigate to="/app" replace />;
  return children;
}
