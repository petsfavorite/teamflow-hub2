import React from 'react';
import { base44 } from '@/api/base44Client';

// Shown when an archived user attempts to log in.
const UserArchivedError = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-white to-slate-50">
      <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-lg border border-slate-100">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-6 rounded-full bg-slate-200">
            <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-4">Account Archived</h1>
          <p className="text-slate-600 mb-8">
            Your account has been archived by an administrator and you can no longer access this app.
          </p>
          <div className="p-4 bg-slate-50 rounded-md text-sm text-slate-600 text-left">
            <p>If you believe this is an error, please contact your administrator to have your account restored.</p>
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

export default UserArchivedError;