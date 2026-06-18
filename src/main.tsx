import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { PremiumDialogProvider } from './components/ui/PremiumDialogProvider';
import './index.css';

// build marker: premium dialog redeploy
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PremiumDialogProvider>
      <App />
    </PremiumDialogProvider>
  </StrictMode>,
);
