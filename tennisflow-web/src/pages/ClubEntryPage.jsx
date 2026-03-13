import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useClubPath } from '../context/ClubContext';
import AuthLayout from '../layouts/AuthLayout';
import LoginPage from './LoginPage';

export default function ClubEntryPage() {
  const { user, loading } = useAuth();
  const toClubPath = useClubPath();

  if (loading) return null;

  if (user) return <Navigate to={toClubPath('/inicio')} replace />;

  return (
    <AuthLayout>
      <LoginPage />
    </AuthLayout>
  );
}