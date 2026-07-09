import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { PremiumDialogProvider } from './components/ui/PremiumDialogProvider';
import './index.css';

const hardenAuthBootstrapStorage = () => {
  try {
    const isProduction = (import.meta as any).env.PROD === true;
    const demoModeEnabled = String((import.meta as any).env.VITE_ENABLE_DEMO_MODE) === 'true';
    const canUseLocalSimulation = !isProduction && ((import.meta as any).env.DEV === true || demoModeEnabled);
    const requestedLocalSimulation = localStorage.getItem('lhp_use_local_simulation') === 'true';

    if (!canUseLocalSimulation) {
      localStorage.setItem('lhp_use_local_simulation', 'false');
    }

    if (!canUseLocalSimulation || !requestedLocalSimulation) {
      localStorage.removeItem('lhp_user');
    }
  } catch (err) {
    console.warn('Security bootstrap storage guard failed:', err);
  }
};

hardenAuthBootstrapStorage();

// build marker: premium dialog redeploy
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PremiumDialogProvider>
      <App />
    </PremiumDialogProvider>
  </StrictMode>,
);
