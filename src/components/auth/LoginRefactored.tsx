/**
 * LoginRefactored - Enhanced login component with Firebase Auth
 * 
 * Features:
 * - Google Sign-In (primary authentication)
 * - Better error handling
 * - Loading states
 */

'use client';

import React, { useState } from 'react';
import { useAuth } from './AuthContextRefactored';
import { Loader2 } from 'lucide-react';

// ============================================================================
// Google Icon Component
// ============================================================================

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

// ============================================================================
// Error Messages
// ============================================================================

const ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'Invalid email address format.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/user-not-found': 'No account found with this email.',
  'auth/wrong-password': 'Invalid password.',
  'auth/invalid-credential': 'Invalid email or password.',
  'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
  'auth/popup-closed-by-user': 'Sign-in cancelled. Please try again.',
  'auth/popup-blocked': 'Sign-in popup was blocked. Please allow popups for this site.',
  'auth/network-request-failed': 'Network error. Please check your connection.',
  'auth/configuration-not-found': 'Google Sign-In is not configured. Please contact your administrator.',
  'USER_NOT_REGISTERED': 'Your account is not registered. Please contact your administrator.',
};

function getErrorMessage(error: any): string {
  const code = error?.code || error?.message || 'unknown';
  return ERROR_MESSAGES[code] || 'An unexpected error occurred. Please try again.';
}

// ============================================================================
// Login Component
// ============================================================================

export function LoginRefactored() {
  // State
  const [error, setError] = useState('');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  
  // Auth context
  const { loginWithGoogle } = useAuth();

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------

  const handleGoogleSignIn = async () => {
    setError('');
    setIsGoogleLoading(true);

    try {
      const success = await loginWithGoogle();
      if (!success) {
        setError('Google sign-in failed. Please try again.');
      }
    } catch (err: any) {
      console.error('[Login] Google sign-in error:', err);
      setError(getErrorMessage(err));
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // Render: Login
  // --------------------------------------------------------------------------

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 relative overflow-hidden">
      {/* LEFT SIDE - Brand panel (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-[55%] relative bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 p-10 xl:p-12 flex-col justify-between overflow-hidden">
        {/* Background decorations */}
        <div className="absolute inset-0">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-white/10 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white/5 rounded-full blur-3xl" />
          {/* Grid pattern */}
          <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        </div>

        {/* Top - Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <span className="text-white font-bold text-lg">A</span>
            </div>
            <div>
              <h2 className="text-white font-semibold text-base tracking-tight">Amble AI</h2>
              <p className="text-white/50 text-[11px] font-medium">Healthcare Intelligence</p>
            </div>
          </div>
        </div>

        {/* Center - Feature highlights */}
        <div className="relative z-10 space-y-6">
          <div>
            <h1 className="text-3xl xl:text-4xl font-bold text-white leading-tight tracking-tight">
              AI-Powered<br />Healthcare<br />Operations
            </h1>
            <p className="text-white/60 text-sm mt-3 max-w-sm leading-relaxed">
              Streamline billing responses, manage knowledge bases, and leverage multi-model AI for smarter healthcare decisions.
            </p>
          </div>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2">
            {[
              { icon: '🧠', label: 'Deep Reasoning' },
              { icon: '🔍', label: 'Knowledge RAG' },
              { icon: '🎤', label: 'Voice Dictation' },
              { icon: '📊', label: 'Billing CX' },
              { icon: '🔒', label: 'HIPAA Ready' },
            ].map((feature) => (
              <div key={feature.label} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 backdrop-blur-sm rounded-full border border-white/15 text-white text-xs font-medium">
                <span className="text-sm">{feature.icon}</span>
                {feature.label}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom - Trust indicators */}
        <div className="relative z-10 flex items-center gap-4 text-white/40 text-[11px]">
          <span>GPT-5 & Gemini 3</span>
          <span className="w-0.5 h-0.5 bg-white/30 rounded-full" />
          <span>Firebase Cloud</span>
          <span className="w-0.5 h-0.5 bg-white/30 rounded-full" />
          <span>End-to-End Encrypted</span>
        </div>
      </div>

      {/* RIGHT SIDE - Login form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 relative">
        {/* Mobile-only background */}
        <div className="lg:hidden absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-indigo-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-[400px] relative z-10">
          {/* Mobile logo (shown on small screens only) */}
          <div className="lg:hidden text-center mb-8">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30 mx-auto mb-3">
              <span className="text-white font-bold text-xl">A</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              Amble AI
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs">
              Healthcare Intelligence Platform
            </p>
          </div>

          {/* Desktop heading */}
          <div className="hidden lg:block mb-6">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Welcome back
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
              Sign in to continue to your AI workspace
            </p>
          </div>

          {/* Google Sign-In Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isGoogleLoading}
            className="w-full bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow transition-all transform active:scale-[0.98] flex items-center justify-center gap-2.5 disabled:opacity-70 disabled:cursor-not-allowed text-sm"
          >
            {isGoogleLoading ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <>
                <GoogleIcon className="w-4 h-4" />
                Continue with Google
              </>
            )}
          </button>

          {/* Error display */}
          {error && (
            <div className="mt-4 flex items-center gap-2 p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-xs">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {error}
            </div>
          )}

          {/* Footer info */}
          <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800">
            <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center leading-relaxed">
              Sign in with your organization Google account.<br />
              Protected by Firebase Authentication.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginRefactored;
