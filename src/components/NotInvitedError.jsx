import React from 'react';
import { base44 } from '@/api/base44Client';

// Shown when someone signs in with an email that was never invited to the app.
const NotInvitedError = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-white to-slate-50">
      <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-lg border border-slate-100">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-6 rounded-full bg-rose-100">
            <svg className="w-8 h-8 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-4">Invitation Required</h1>
          <p className="text-slate-600 mb-8">
            This app is invite-only. Your email address hasn't been invited, so you can't create an account here.
          </p>
          <div className="p-4 bg-slate-50 rounded-md text-sm text-slate-600 text-left">
            <p>To get access, ask an administrator to send an invitation to your email address.</p>
          </div>
          <button
            onClick={() => base44.auth.logout(window.location.href)}
            className="mt-6 px-5 py-2.5 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotInvitedError;