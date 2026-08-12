import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import GuestRoute from "./components/auth/GuestRoute";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import OnboardingPage from "./pages/OnboardingPage";
import AppHomePage from "./pages/AppHomePage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  return (
    <AuthProvider>
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
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <AppHomePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
