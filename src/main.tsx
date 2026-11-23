import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { FirebaseProvider } from './components/AuthContext.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  try {
    registerSW({
      immediate: true,
      onRegisterError() {
        // Ignore service worker registration errors in restricted preview sandboxes
      },
    });
  } catch {
    // Ignore service worker registration errors in restricted preview sandboxes
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <FirebaseProvider>
      <App />
    </FirebaseProvider>
  </ErrorBoundary>,
);
