import React, { useState, useEffect, useRef } from 'react';
import { usePinContext } from '@/lib/PinContext';
import { base44 } from '@/api/base44Client';
import { Lock, Delete, LogOut } from 'lucide-react';

const MAX_LOCK_MINUTES = 60;
const WARN_AT_MINUTES = 20;

export default function PinLockScreen() {
  const { isLocked, lockedAt, unlock } = usePinContext();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [minutesLeft, setMinutesLeft] = useState(MAX_LOCK_MINUTES);
  const pinRef = useRef('');
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!isLocked || !lockedAt) return;
    const update = () => {
      const elapsed = (Date.now() - lockedAt) / 60000;
      setMinutesLeft(Math.max(0, Math.round(MAX_LOCK_MINUTES - elapsed)));
    };
    update();
    const id = setInterval(update, 15000);
    return () => clearInterval(id);
  }, [isLocked, lockedAt]);

  const handleValidate = async (p) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const res = await base44.functions.invoke('validatePin', { pin: p });
      if (res.data?.valid) {
        unlock(res.data.user);
        pinRef.current = '';
        setPin('');
      } else {
        setError('Incorrect PIN. Please try again.');
        pinRef.current = '';
        setPin('');
      }
    } catch {
      setError('Could not validate PIN. Please try again.');
      pinRef.current = '';
      setPin('');
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const pressKey = (key) => {
    if (loading || submittingRef.current) return;
    if (key === 'del') {
      const next = pinRef.current.slice(0, -1);
      pinRef.current = next;
      setPin(next);
      setError('');
    } else {
      if (pinRef.current.length >= 6) return;
      const next = pinRef.current + key;
      pinRef.current = next;
      setPin(next);
      if (next.length === 6) {
        handleValidate(next);
      }
    }
  };

  const handleFullLogout = () => {
    sessionStorage.removeItem('pin_session');
    base44.auth.logout(window.location.href);
  };

  if (!isLocked) return null;

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', null, '0', 'del'];

  return (
    <div className="fixed inset-0 z-[9999] bg-stone-950/97 backdrop-blur-md flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-xs space-y-8">

        {/* Icon + title */}
        <div className="text-center space-y-3">
          <div className="w-20 h-20 rounded-full bg-stone-800 border border-stone-700 flex items-center justify-center mx-auto shadow-xl">
            <Lock className="w-9 h-9 text-[#82bb32]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Session Locked</h1>
            <p className="text-stone-400 text-sm mt-1">Enter your 6-digit PIN to continue</p>
          </div>
          {minutesLeft <= WARN_AT_MINUTES && (
            <div className="bg-amber-900/40 border border-amber-700/50 rounded-xl px-3 py-2">
              <p className="text-amber-300 text-xs font-medium">
                ⚠ Full sign-out in ~{minutesLeft} min — use PIN to continue
              </p>
            </div>
          )}
        </div>

        {/* PIN dots */}
        <div className="flex justify-center gap-4">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full transition-all duration-150 ${
                i < pin.length
                  ? 'bg-[#82bb32] scale-110'
                  : 'bg-stone-700 border border-stone-600'
              }`}
            />
          ))}
        </div>

        {/* Error message */}
        <div className="h-5 text-center">
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {loading && <p className="text-stone-400 text-sm animate-pulse">Verifying…</p>}
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3">
          {keys.map((key, i) => {
            if (key === null) return <div key={i} />;
            if (key === 'del') {
              return (
                <button
                  key={i}
                  onClick={() => pressKey('del')}
                  disabled={loading}
                  className="h-16 rounded-2xl bg-stone-800 border border-stone-700 text-stone-300 flex items-center justify-center hover:bg-stone-700 active:scale-95 transition-all disabled:opacity-40"
                >
                  <Delete className="w-5 h-5" />
                </button>
              );
            }
            return (
              <button
                key={i}
                onClick={() => pressKey(key)}
                disabled={loading}
                className="h-16 rounded-2xl bg-stone-800 border border-stone-700 text-white text-xl font-semibold hover:bg-stone-700 active:scale-95 transition-all disabled:opacity-40"
              >
                {key}
              </button>
            );
          })}
        </div>

        {/* Full logout link */}
        <div className="text-center pt-2">
          <button
            onClick={handleFullLogout}
            className="text-stone-600 hover:text-stone-400 text-sm flex items-center gap-1.5 mx-auto transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out completely (use email & password)
          </button>
        </div>
      </div>
    </div>
  );
}