import AuthLayout from '../layouts/AuthLayout';
import MainLayout from '../layouts/MainLayout';
import { useAuth } from '../context/AuthContext';
import LoginPage from './LoginPage';
import TorneosPage from './TorneosPage';

export default function ClubEntryPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <AuthLayout>
        <LoginPage />
      </AuthLayout>
    );
  }

  return (
    <MainLayout>
      <TorneosPage />
    </MainLayout>
  );
}
