import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth';
import { Spinner } from './ui';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import Login from './screens/Login';
import WalletScreen from './screens/Wallet';
import Available from './screens/Available';
import Responsibilities from './screens/Responsibilities';
import Goals from './screens/Goals';
import Manage from './screens/Manage';
import { isParent } from './family';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!user) return <Login />;

  return (
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
  );
}
