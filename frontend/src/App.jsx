import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./components/common/Toast";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import GuestRoute from "./components/auth/GuestRoute";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import OnboardingPage from "./pages/OnboardingPage";
import SettingsPage from "./pages/SettingsPage";
import DashboardPage from "./pages/DashboardPage";
import LogsPage from "./pages/LogsPage";
import AlertsPage from "./pages/AlertsPage";
import ComingSoonPage from "./pages/ComingSoonPage";
import AppShell from "./components/layout/AppShell";

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route
              path="/login"
              element={
                <GuestRoute>
                  <LoginPage />
                </GuestRoute>
              }
            />
            {/* Not GuestRoute: step 1 signs the user in immediately (see AuthContext.signup),
                so steps 2-3 must stay reachable while authenticated, unlike /login. */}
            <Route path="/onboarding" element={<OnboardingPage />} />

            {/* Shared layout route: AppShell (sidebar+topbar) wraps both /app/*
                and /settings so they render as one consistent app, sidebar/topbar
                persisting across navigation instead of remounting per page. */}
            <Route
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route path="/app" element={<DashboardPage />} />
              <Route path="/app/logs" element={<LogsPage />} />
              <Route path="/app/alerts" element={<AlertsPage />} />
              <Route path="/app/incidents" element={<ComingSoonPage title="Incidents" sprint={6} />} />
              <Route path="/app/reports" element={<ComingSoonPage title="Reports" sprint={8} />} />
              <Route path="/app/intel" element={<ComingSoonPage title="Threat intel" sprint={8} />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
