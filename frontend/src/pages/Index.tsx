import { Navigate } from 'react-router-dom';

export default function WelcomePage() {
  return <Navigate to="/login" replace />;
}
