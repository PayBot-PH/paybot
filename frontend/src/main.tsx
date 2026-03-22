import { Component, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryState { error: Error | null }

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ fontFamily: 'monospace', padding: '2rem', background: '#0a0f1e', color: '#f87171', minHeight: '100vh' }}>
          <h1 style={{ color: '#ef4444', marginBottom: '1rem' }}>Application Error</h1>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#fca5a5' }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

// Dismiss the pre-React HTML loader once React has painted its first frame.
const htmlLoader = document.getElementById('html-loader');
if (htmlLoader) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      htmlLoader.classList.add('fade-out');
      setTimeout(() => htmlLoader.remove(), 500);
    });
  });
}
