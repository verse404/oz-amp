import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { LocaleProvider } from './i18n/LocaleContext';
import { IS_STATIC_MODE } from './config/runtimeMode';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD && !IS_STATIC_MODE) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      // Ignore registration failures on unsupported/private browser contexts
    });
  });
}
