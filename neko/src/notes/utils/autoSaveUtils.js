// Auto-Save System
import { useCallback, useRef, useEffect, useState } from "react";

/**
 * Enhanced debounce function with conditional delay
 */
export const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    // If wait is a function, call it with the first argument to get delay
    const delay = typeof wait === "function" ? wait(args[1]) : wait;
    timeout = setTimeout(() => func(...args), delay);
  };
};

/**
 * Auto-save hook - Enhanced with typing detection
 */
export const useAutoSave = (saveFunction, options = {}) => {
  const {
    delay = 2000, // Reasonable default delay
    enabled = true,
    onStatusChange = () => {},
    getIsTyping = null, // Function that returns current typing state
  } = options;

  const saveTimeoutRef = useRef(null);
  const isSavingRef = useRef(false);
  const lastSavedContentRef = useRef(null);
  const pendingChangesRef = useRef(false);
  const lastTypingRef = useRef(0);
  const isTypingRef = useRef(false);
  const getIsTypingRef = useRef(getIsTyping);

  // Update the typing getter ref when it changes
  useEffect(() => {
    getIsTypingRef.current = getIsTyping;
  }, [getIsTyping]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const scheduleAutoSave = useCallback(
    (content, isTyping = false) => {
      if (!enabled || isSavingRef.current) return;

      // Check content equality
      const contentString = JSON.stringify(content);
      if (contentString === lastSavedContentRef.current) {
        return; // No changes, don't save
      }

      pendingChangesRef.current = content;

      // Track typing activity
      if (isTyping) {
        lastTypingRef.current = Date.now();
        isTypingRef.current = true;
      }

      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Use longer delay if user is actively typing to prevent cursor issues
      const saveDelay = isTyping ? Math.max(delay * 2, 3000) : delay;

      // Schedule new save
      saveTimeoutRef.current = setTimeout(async () => {
        // Check if user is still typing using LIVE state from the editor
        // This ensures we always have the most current typing state, not the state from when save was scheduled
        const currentlyTyping = getIsTypingRef.current
          ? getIsTypingRef.current()
          : isTypingRef.current;

        if (currentlyTyping) {
          // Still typing, reschedule
          scheduleAutoSave(content, false);
          return;
        }

        if (isSavingRef.current || !pendingChangesRef.current) return;

        try {
          isSavingRef.current = true;
          isTypingRef.current = false;
          onStatusChange("auto-saving");

          const result = await saveFunction(pendingChangesRef.current);

          lastSavedContentRef.current = contentString;
          pendingChangesRef.current = false;
          onStatusChange("auto-saved");

          // Clear status after shorter time
          setTimeout(() => onStatusChange(null), 1500);
        } catch (error) {
          console.error("Auto-save failed:", error);
          onStatusChange("error");

          // Reset pending changes on error so we can retry
          pendingChangesRef.current = false;

          setTimeout(() => onStatusChange(null), 3000);
        } finally {
          isSavingRef.current = false;
        }
      }, saveDelay);
    },
    [enabled, delay, saveFunction, onStatusChange]
  );

  const saveNow = useCallback(
    async (content) => {
      if (isSavingRef.current) {
        // If already saving, wait for it to complete
        return new Promise((resolve) => {
          const checkSaving = () => {
            if (!isSavingRef.current) {
              resolve();
            } else {
              setTimeout(checkSaving, 100);
            }
          };
          checkSaving();
        });
      }

      // Clear scheduled save since we're saving now
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      try {
        isSavingRef.current = true;
        onStatusChange("saving");

        const result = await saveFunction(content);
        lastSavedContentRef.current = JSON.stringify(content);

        onStatusChange("saved");

        // Clear status after 2 seconds
        setTimeout(() => onStatusChange(null), 2000);

        return result;
      } catch (error) {
        console.error("Save failed:", error);
        onStatusChange("error");
        setTimeout(() => onStatusChange(null), 3000);
        throw error;
      } finally {
        isSavingRef.current = false;
        pendingChangesRef.current = false;
      }
    },
    [saveFunction, onStatusChange]
  );

  const cancelAutoSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    pendingChangesRef.current = false;
    onStatusChange(null);
  }, [onStatusChange]);

  // Force immediate save for navigation scenarios
  const saveImmediately = useCallback(
    async (content) => {
      // Cancel any pending saves
      cancelAutoSave();

      // Force save immediately without waiting
      try {
        const result = await saveFunction(content);
        lastSavedContentRef.current = JSON.stringify(content);
        return result;
      } catch (error) {
        console.error("Immediate save failed:", error);
        throw error;
      }
    },
    [saveFunction, cancelAutoSave]
  );

  return {
    scheduleAutoSave,
    saveNow,
    cancelAutoSave,
    saveImmediately,
    isAutosaving: isSavingRef.current,
  };
};

/**
 * Content change detection
 */
export const hasContentChanged = (oldContent, newContent) => {
  if (!oldContent && !newContent) return false;
  if (!oldContent || !newContent) return true;

  if (oldContent.title !== newContent.title) return true;

  // Compare blocks
  if (!oldContent.blocks || !newContent.blocks) return true;
  if (oldContent.blocks.length !== newContent.blocks.length) return true;

  return oldContent.blocks.some((oldBlock, index) => {
    const newBlock = newContent.blocks[index];
    return (
      !newBlock ||
      oldBlock.id !== newBlock.id ||
      oldBlock.type !== newBlock.type ||
      oldBlock.content !== newBlock.content ||
      JSON.stringify(oldBlock.properties) !==
        JSON.stringify(newBlock.properties)
    );
  });
};

/**
 * Network status hook
 */
export const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
};

export default {
  debounce,
  useAutoSave,
  hasContentChanged,
  useNetworkStatus,
};
