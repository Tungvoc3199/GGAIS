import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { PremiumDialogProvider } from './components/ui/PremiumDialogProvider';
import { installAuthStorageGuard } from './security/authStorageGuard';
import './index.css';

installAuthStorageGuard();

// build marker: premium dialog redeploy
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PremiumDialogProvider>
      <App />
    </PremiumDialogProvider>
  </StrictMode>,
);
