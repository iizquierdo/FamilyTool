import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { Spinner } from './ui';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import InstallPrompt from './components/InstallPrompt';
import Login from './screens/Login';
import JoinFamily from './screens/JoinFamily';
import WalletScreen from './screens/Wallet';
import Available from './screens/Available';
import Responsibilities from './screens/Responsibilities';
import Goals from './screens/Goals';
import Manage from './screens/Manage';
import { isParent } from './family';

export default function App() {
  const { user, loading } = useAuth();
  const location = useLocation();
  // El flujo de invitación (/join) ya ofrece instalar dentro de su propio onboarding.
  const isJoinFlow = location.pathname === '/join';

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    if (isJoinFlow) {
      const code = new URLSearchParams(location.search).get('code');
      if (code) return <JoinFamily code={code} />;
    }
    return (
      <>
        {!isJoinFlow && <InstallPrompt />}
        <Login />
      </>
    );
  }

  return (
    <>
      {!isJoinFlow && <InstallPrompt />}
      <div className="mx-auto min-h-full max-w-lg">
        <Header />
        <main className="safe-bottom px-4 pt-4">
          <Routes>
            <Route path="/" element={<WalletScreen />} />
            <Route path="/available" element={<Available />} />
            <Route path="/responsibilities" element={<Responsibilities />} />
            <Route path="/goals" element={<Goals />} />
            {isParent(user.role) && <Route path="/manage" element={<Manage />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </>
  );
}
