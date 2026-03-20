import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

const PinContext = createContext(null);

const SESSION_KEY = 'pin_session';
const DEFAULT_TIMEOUT_MINUTES = 5;
const MAX_LOCK_MINUTES = 60;

function readSessionStorage() {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

const IS_PREVIEW = window.location.hostname.includes('base44.com') || window.location.hostname.includes('localhost');

export function PinProvider({ children }) {
  const { isAuthenticated } = useAuth();

  // Synchronously determine initial lock state to avoid flash of unlocked content
  const [isLocked, setIsLocked] = useState(() => {
    const s = readSessionStorage();
    if (!s?.lockedAt) return false;
    return (Date.now() - s.lockedAt) / 60000 < MAX_LOCK_MINUTES;
  });

  const [lockedAt, setLockedAt] = useState(() => {
    const s = readSessionStorage();
    return s?.lockedAt || null;
  });

  const [activeUser, setActiveUser] = useState(null);
  const [timeoutMinutes, setTimeoutMinutes] = useState(DEFAULT_TIMEOUT_MINUTES);

  const timerRef = useRef(null);
  const timeoutRef = useRef(DEFAULT_TIMEOUT_MINUTES);
  const lastActivityRef = useRef(Date.now());

  // Keep ref in sync with state
  useEffect(() => {
    timeoutRef.current = timeoutMinutes;
  }, [timeoutMinutes]);

  // On mount: handle expired session & load settings
  useEffect(() => {
    const s = readSessionStorage();
    if (s?.lockedAt && (Date.now() - s.lockedAt) / 60000 >= MAX_LOCK_MINUTES) {
      sessionStorage.removeItem(SESSION_KEY);
      base44.auth.logout(window.location.href);
      return;
    }

    // Load inactivity timeout from AppSettings
    base44.entities.AppSettings.filter({ key: 'global' })
      .then(results => {
        if (results.length > 0 && results[0].inactivity_timeout_minutes) {
          const mins = Number(results[0].inactivity_timeout_minutes);
          if (mins > 0) {
            setTimeoutMinutes(mins);
            timeoutRef.current = mins;
          }
        }
      })
      .catch(() => {});
  }, []);

  const lock = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const now = Date.now();
    setIsLocked(true);
    setLockedAt(now);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ lockedAt: now }));
  }, []);

  const unlock = useCallback((user) => {
    setIsLocked(false);
    setLockedAt(null);
    setActiveUser(user);
    sessionStorage.removeItem(SESSION_KEY);
    lastActivityRef.current = Date.now();
  }, []);

  const startTimer = useCallback(() => {
    if (IS_PREVIEW) return; // Disabled in Base44 preview
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => lock(), timeoutRef.current * 60 * 1000);
  }, [lock]);

  // Inactivity tracking (only when authenticated and unlocked)
  useEffect(() => {
    if (!isAuthenticated || isLocked) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    const onActivity = () => {
      lastActivityRef.current = Date.now();
      startTimer();
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'click'];
    events.forEach(e => window.addEventListener(e, onActivity, { passive: true }));
    startTimer();

    return () => {
      events.forEach(e => window.removeEventListener(e, onActivity));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isAuthenticated, isLocked, startTimer]);

  // Visibility change — catches sleep/wake and tab switching
  useEffect(() => {
    if (!isAuthenticated) return;
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible' || isLocked) return;
      const elapsed = (Date.now() - lastActivityRef.current) / 60000;
      if (elapsed >= timeoutRef.current) {
        lock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isAuthenticated, isLocked, lock]);

  // Poll for 60-minute lock expiry
  useEffect(() => {
    if (!isLocked || !lockedAt) return;
    const interval = setInterval(() => {
      if ((Date.now() - lockedAt) / 60000 >= MAX_LOCK_MINUTES) {
        sessionStorage.removeItem(SESSION_KEY);
        base44.auth.logout(window.location.href);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [isLocked, lockedAt]);

  return (
    <PinContext.Provider value={{
      isLocked,
      activeUser,
      lockedAt,
      lock,
      unlock,
      timeoutMinutes,
      setTimeoutMinutes,
    }}>
      {children}
    </PinContext.Provider>
  );
}

export const usePinContext = () => useContext(PinContext);