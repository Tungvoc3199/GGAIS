/**
 * Runtime guard for auth-related localStorage keys.
 *
 * Security intent:
 * - Cloud/Firebase profile must not be persisted in the legacy lhp_user cache.
 * - Local demo/simulation user cache is isolated to lhp_local_demo_user.
 * - Production build cannot force-enable local simulation with DevTools.
 */

const LEGACY_USER_KEY = 'lhp_user';
const LOCAL_DEMO_USER_KEY = 'lhp_local_demo_user';
const LOCAL_SIMULATION_KEY = 'lhp_use_local_simulation';

export const installAuthStorageGuard = () => {
  try {
    const storage = window.localStorage;
    const proto = Object.getPrototypeOf(storage) as Storage;
    const originalGetItem = proto.getItem.bind(storage);
    const originalSetItem = proto.setItem.bind(storage);
    const originalRemoveItem = proto.removeItem.bind(storage);

    const isProduction = (import.meta as any).env.PROD === true;
    const demoModeEnabled = String((import.meta as any).env.VITE_ENABLE_DEMO_MODE) === 'true';
    const canUseLocalSimulation = !isProduction && ((import.meta as any).env.DEV === true || demoModeEnabled);

    const isLocalSimulationAllowed = () => {
      return canUseLocalSimulation && originalGetItem(LOCAL_SIMULATION_KEY) === 'true';
    };

    if (!canUseLocalSimulation) {
      originalSetItem(LOCAL_SIMULATION_KEY, 'false');
    }

    // Migrate legacy local demo cache once, then clean unsafe cache before React reads it.
    const legacyCachedUser = originalGetItem(LEGACY_USER_KEY);
    if (isLocalSimulationAllowed() && legacyCachedUser && !originalGetItem(LOCAL_DEMO_USER_KEY)) {
      originalSetItem(LOCAL_DEMO_USER_KEY, legacyCachedUser);
    }

    if (isLocalSimulationAllowed()) {
      const localDemoUser = originalGetItem(LOCAL_DEMO_USER_KEY);
      if (localDemoUser) {
        originalSetItem(LEGACY_USER_KEY, localDemoUser);
      }
    } else {
      originalRemoveItem(LEGACY_USER_KEY);
    }

    proto.getItem = function guardedGetItem(key: string): string | null {
      if (key === LEGACY_USER_KEY) {
        if (!isLocalSimulationAllowed()) return null;
        return originalGetItem(LOCAL_DEMO_USER_KEY) || originalGetItem(LEGACY_USER_KEY);
      }
      return originalGetItem(key);
    };

    proto.setItem = function guardedSetItem(key: string, value: string): void {
      if (key === LOCAL_SIMULATION_KEY) {
        originalSetItem(key, canUseLocalSimulation && value === 'true' ? 'true' : 'false');
        if (!(canUseLocalSimulation && value === 'true')) {
          originalRemoveItem(LEGACY_USER_KEY);
        }
        return;
      }

      if (key === LEGACY_USER_KEY) {
        if (isLocalSimulationAllowed()) {
          originalSetItem(LOCAL_DEMO_USER_KEY, value);
          originalSetItem(LEGACY_USER_KEY, value);
        } else {
          originalRemoveItem(LEGACY_USER_KEY);
        }
        return;
      }

      originalSetItem(key, value);
    };

    proto.removeItem = function guardedRemoveItem(key: string): void {
      if (key === LEGACY_USER_KEY || key === LOCAL_DEMO_USER_KEY) {
        originalRemoveItem(LEGACY_USER_KEY);
        originalRemoveItem(LOCAL_DEMO_USER_KEY);
        return;
      }
      originalRemoveItem(key);
    };
  } catch (err) {
    console.warn('Auth storage guard failed:', err);
  }
};
