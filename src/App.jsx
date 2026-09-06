import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase/firebase';

import { useAppStore } from './context/store';
import { loadContacts } from './services/contactsService';
import { useShakeSOS } from './hooks/useShakeSOS';

import SplashPage     from './pages/Splash/SplashPage';
import OnboardingPage from './pages/Onboarding/OnboardingPage';
import LoginPage      from './pages/Login/LoginPage';
import SignupPage     from './pages/SignupPage';
import PermissionsPage from './pages/Permissions/PermissionsPage';

import MainLayout from './components/navigation/MainLayout';

import WeatherPage        from './pages/Weather/WeatherPage';
import HomePage           from './pages/Home/HomePage';
import SearchPage         from './pages/Search/SearchPage';
import RouteSelectionPage from './pages/RouteSelection/RouteSelectionPage';
import NavigationPage     from './pages/Navigation/NavigationPage';
import SafetyPage         from './pages/Safety/SafetyPage';
import ReportsPage        from './pages/Reports/ReportsPage';
import EmergencyPage      from './pages/Emergency/EmergencyPage';
import ProfilePage        from './pages/Profile/ProfilePage';
import JourneyReviewPage  from './pages/Review/JourneyReviewPage';
import ChatPage           from './pages/Chat/ChatPage';

// ── Medical & Badge Additions ──
import AchievementsPage   from './pages/Profile/AchievementsPage';

// ── Developer ML Playground ──
import MLPlaygroundPage   from './pages/MLPlayground/MLPlaygroundPage';

function PrivateRoute({ children }) {
  const { isLoggedIn, hasPermissions } = useAppStore();
  if (!isLoggedIn)    return <Navigate to="/login"       replace />;
  if (!hasPermissions) return <Navigate to="/permissions" replace />;
  return children;
}

// ─── Global Shake-to-SOS (always active while logged in) ─────────────────────
function ShakeSOSListener() {
  const { isLoggedIn } = useAppStore();
  const navigate = useNavigate();

  const handleShake = useCallback(() => {
    // When shaken, navigate to emergency screen which handles alarms and sharing
    navigate('/emergency');
  }, [navigate]);

  useShakeSOS(handleShake, isLoggedIn);
  return null;
}

export default function App() {
  const { setIsLoggedIn, setUser, setEmergencyContacts } = useAppStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser({
          name:        user.displayName || '',
          email:       user.email       || '',
          avatar:      user.photoURL    || null,
          phone:       user.phoneNumber || '',
          memberSince: new Date(user.metadata.creationTime).getFullYear().toString(),
        });
        // Load this user's contacts from Firestore (never show another user's contacts)
        const contacts = await loadContacts(user.uid);
        setEmergencyContacts(contacts);
        setIsLoggedIn(true);
      } else {
        setIsLoggedIn(false);
        setEmergencyContacts([]);
        setUser({ name: '', email: '', avatar: null, phone: '', memberSince: '' });
      }
    });
    return () => unsubscribe();
  }, [setIsLoggedIn, setUser, setEmergencyContacts]);

  return (
    <BrowserRouter>
      <ShakeSOSListener />
      <Routes>
        <Route path="/splash"      element={<SplashPage />} />
        <Route path="/onboarding"  element={<OnboardingPage />} />
        <Route path="/login"       element={<LoginPage />} />
        <Route path="/signup"      element={<SignupPage />} />
        <Route path="/permissions" element={<PermissionsPage />} />
        <Route path="/emergency"   element={<EmergencyPage />} />
        <Route path="/dev/model-test" element={<MLPlaygroundPage />} />

        <Route
          path="/"
          element={
            <PrivateRoute>
              <MainLayout />
            </PrivateRoute>
          }
        >
          <Route index        element={<HomePage />} />
          <Route path="search"   element={<SearchPage />} />
          <Route path="routes"   element={<RouteSelectionPage />} />
          <Route path="navigate" element={<NavigationPage />} />
          <Route path="safety"   element={<SafetyPage />} />
          <Route path="reports"  element={<ReportsPage />} />
          <Route path="weather"  element={<WeatherPage />} />
          <Route path="profile"  element={<ProfilePage />} />
          <Route path="review"   element={<JourneyReviewPage />} />
          <Route path="chat"     element={<ChatPage />} />
          
          {/* ── Badge / Achievements Route ── */}
          <Route path="achievements" element={<AchievementsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/splash" replace />} />
      </Routes>
    </BrowserRouter>
  );
}