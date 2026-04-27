import { useEffect, useRef } from 'react';

// Idle Detection Hook
export const useIdleDetection = (onIdle, idleTime = 15 * 60 * 1000) => {
  const timeoutRef = useRef();
  const isIdleRef = useRef(false);

  const resetTimer = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (isIdleRef.current) {
      isIdleRef.current = false;
    }
    timeoutRef.current = setTimeout(() => {
      if (!isIdleRef.current) {
        isIdleRef.current = true;
        onIdle();
      }
    }, idleTime);
  };

  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    const resetTimerHandler = () => resetTimer();
    events.forEach(event => {
      document.addEventListener(event, resetTimerHandler, true);
    });
    resetTimer();
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, resetTimerHandler, true);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idleTime, onIdle]);

  return { resetTimer };
};

// Global 401 Error Context
import { createContext, useContext } from 'react';

const UnauthorizedErrorContext = createContext();

export const useUnauthorizedError = () => {
  const context = useContext(UnauthorizedErrorContext);
  if (!context) {
    throw new Error('useUnauthorizedError must be used within UnauthorizedErrorProvider');
  }
  return context;
};

export { UnauthorizedErrorContext };