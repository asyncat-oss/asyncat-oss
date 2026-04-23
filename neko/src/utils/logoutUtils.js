// utils/logoutUtils.js - Comprehensive logout utility
export const clearAllStorageAndCache = async () => {
  try {
    // Clear localStorage
    localStorage.clear();

    // Clear sessionStorage
    sessionStorage.clear();

    // Clear all cookies
    document.cookie.split(";").forEach(function(c) {
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });

    // Clear cookies for all possible paths and domains
    const cookiesToClear = ['auth-token', 'asyncat_token'];
    cookiesToClear.forEach(cookieName => {
      // Clear for current domain
      document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      // Clear for domain with dot prefix
      document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname};`;
      // Clear for parent domain
      const parts = window.location.hostname.split('.');
      if (parts.length > 1) {
        document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${parts.slice(-2).join('.')};`;
      }
    });

    // Clear IndexedDB if available
    if (window.indexedDB) {
      try {
        const databases = await indexedDB.databases();
        await Promise.all(
          databases.map(db => {
            return new Promise((resolve, reject) => {
              const deleteReq = indexedDB.deleteDatabase(db.name);
              deleteReq.onsuccess = () => resolve();
              deleteReq.onerror = () => reject(deleteReq.error);
            });
          })
        );
      } catch (e) {
        console.warn('Could not clear IndexedDB:', e);
      }
    }

    // Clear WebSQL if available (deprecated but still might exist)
    if (window.openDatabase) {
      try {
        const db = window.openDatabase('', '', '', '');
        if (db) {
          db.transaction(tx => {
            tx.executeSql('DELETE FROM __WebKitDatabaseInfoTable__');
          });
        }
      } catch (e) {
        console.warn('Could not clear WebSQL:', e);
      }
    }

    // Clear Cache API if available
    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      } catch (e) {
        console.warn('Could not clear Cache API:', e);
      }
    }

    // Clear Service Worker registrations if available
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map(registration => registration.unregister())
        );
      } catch (e) {
        console.warn('Could not clear Service Worker registrations:', e);
      }
    }

    console.log('All storage and cache cleared successfully');
    return true;
  } catch (error) {
    console.error('Error clearing storage and cache:', error);
    return false;
  }
};

export const performCompleteLogout = async (authService) => {
  try {
    // Call basicSignOut to revoke the server-side session (stateless JWT: just clears token)
    await authService.basicSignOut();

    // Then clear all storage and cache
    await clearAllStorageAndCache();

    // Give a small delay to ensure everything is cleared
    await new Promise(resolve => setTimeout(resolve, 100));

    return true;
  } catch (error) {
    console.error('Error during complete logout:', error);
    // Even if logout fails, still clear everything
    await clearAllStorageAndCache();
    return false;
  }
};