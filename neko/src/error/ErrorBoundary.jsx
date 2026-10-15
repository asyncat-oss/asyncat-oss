import React from 'react';
import PropTypes from 'prop-types';
import { useNavigate, useRouteError } from 'react-router-dom';
import { RotateCw } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import ErrorScreen from './ErrorScreen.jsx';

export const RouteErrorElement = () => {
  const error = useRouteError();
  const navigate = useNavigate();
  const detail = error?.statusText || error?.message || '';

  return (
    <ErrorScreen title="Something went wrong" message="Asyncat couldn't open this page." detail={detail}>
      <Button variant="secondary" size="md" icon={RotateCw} onClick={() => window.location.reload()}>Reload</Button>
      <Button variant="primary" size="md" onClick={() => navigate('/home')}>Go home</Button>
    </ErrorScreen>
  );
};

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Application error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <ErrorScreen title="Something went wrong" message="Asyncat hit a problem showing this.">
        <Button variant="secondary" size="md" icon={RotateCw} onClick={() => window.location.reload()}>Reload app</Button>
        <Button variant="primary" size="md" onClick={this.handleReset}>Try again</Button>
      </ErrorScreen>
    );
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node,
};

export default ErrorBoundary;
