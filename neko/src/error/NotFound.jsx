import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import ErrorScreen from './ErrorScreen.jsx';

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <ErrorScreen title="Page not found" message="This page doesn't exist or was removed.">
      <Button variant="secondary" size="md" icon={ArrowLeft} onClick={() => navigate(-1)}>Go back</Button>
      <Button variant="primary" size="md" onClick={() => navigate('/home')}>Go home</Button>
    </ErrorScreen>
  );
};

export default NotFound;
