/**
 * LoginRefactored - Enhanced login component with Firebase Auth
 * 
 * Features:
 * - Email/password login
 * - Google Sign-In
 * - Password reset flow
 * - Better error handling
 * - Loading states
 */

'use client';

import React, { useState } from 'react';
import { useAuth } from './AuthContextRefactored';
import { Lock, Mail, Loader2, ArrowLeft } from 'lucide-react';

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

type LoginView = 'login' | 'reset-password' | 'reset-sent';

export function LoginRefactored() {
  // State
  const [view, setView] = useState<LoginView>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  
  // Auth context
  const { login, loginWithGoogle, sendPasswordResetEmail } = useAuth();

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const success = await login(email, password);
      if (!success) {
        setError('Invalid email or password');
      }
    } catch (err: any) {
      console.error('[Login] Email sign-in error:', err);
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

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

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await sendPasswordResetEmail(email);
      setView('reset-sent');
    } catch (err: any) {
      console.error('[Login] Password reset error:', err);
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const goToLogin = () => {
    setView('login');
    setError('');
  };

  const goToResetPassword = () => {
    setView('reset-password');
    setError('');
  };

  // --------------------------------------------------------------------------
  // Render: Password Reset Sent
  // --------------------------------------------------------------------------

  if (view === 'reset-sent') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-8 animate-in zoom-in-95 duration-300">
          <div className="text-center">
            <div className="w-16 h-16 bg-green-600 rounded-2xl flex items-center justify-center text-white text-3xl shadow-lg shadow-green-500/30 mx-auto mb-4">
              ✓
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Check Your Email
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mb-6">
              We've sent password reset instructions to:
            </p>
            <p className="text-indigo-600 dark:text-indigo-400 font-medium mb-8">
              {email}
            </p>
            <button
              onClick={goToLogin}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-500/20 transition-all transform active:scale-95"
            >
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Render: Password Reset Form
  // --------------------------------------------------------------------------

  if (view === 'reset-password') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-8 animate-in zoom-in-95 duration-300">
          <button
            onClick={goToLogin}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 mb-6 transition-colors"
          >
            <ArrowLeft size={18} />
            Back to Sign In
          </button>

          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-bold text-3xl shadow-lg shadow-indigo-500/30 mx-auto mb-4">
              <Lock size={32} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Reset Password
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2">
              Enter your email and we'll send you reset instructions
            </p>
          </div>

          <form onSubmit={handleResetPassword} className="space-y-5">
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm text-center">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-900 dark:text-slate-100"
                  placeholder="you@example.com"
                  required
                  autoFocus
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-500/20 transition-all transform active:scale-95 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                'Send Reset Instructions'
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Render: Login Form
  // --------------------------------------------------------------------------

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 relative overflow-hidden">
      {/* LEFT SIDE - Brand panel (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-[55%] relative bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 p-12 flex-col justify-between overflow-hidden">
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
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/20">
              <span className="text-white font-bold text-2xl">A</span>
            </div>
            <div>
              <h2 className="text-white font-bold text-xl tracking-tight">Amble AI</h2>
              <p className="text-white/60 text-xs font-medium">Healthcare Intelligence</p>
            </div>
          </div>
        </div>

        {/* Center - Feature highlights */}
        <div className="relative z-10 space-y-8">
          <div>
            <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight tracking-tight">
              AI-Powered<br />Healthcare<br />Operations
            </h1>
            <p className="text-white/70 text-lg mt-4 max-w-md leading-relaxed">
              Streamline billing responses, manage knowledge bases, and leverage multi-model AI for smarter healthcare decisions.
            </p>
          </div>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-3">
            {[
              { icon: '🧠', label: 'Deep Reasoning' },
              { icon: '🔍', label: 'Knowledge RAG' },
              { icon: '🎤', label: 'Voice Dictation' },
              { icon: '📊', label: 'Billing CX' },
              { icon: '🔒', label: 'HIPAA Ready' },
            ].map((feature) => (
              <div key={feature.label} className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full border border-white/15 text-white text-sm font-medium">
                <span>{feature.icon}</span>
                {feature.label}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom - Trust indicators */}
        <div className="relative z-10 flex items-center gap-6 text-white/50 text-xs">
          <span>GPT-5 & Gemini 3</span>
          <span className="w-1 h-1 bg-white/30 rounded-full" />
          <span>Firebase Cloud</span>
          <span className="w-1 h-1 bg-white/30 rounded-full" />
          <span>End-to-End Encrypted</span>
        </div>
      </div>

      {/* RIGHT SIDE - Login form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 relative">
        {/* Mobile-only background */}
        <div className="lg:hidden absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-indigo-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md relative z-10">
          {/* Mobile logo (shown on small screens only) */}
          <div className="lg:hidden text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-2xl flex items-center justify-center text-white font-bold text-3xl shadow-lg shadow-indigo-500/30 mx-auto mb-4 animate-glow-pulse">
              A
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Amble AI
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
              Healthcare Intelligence Platform
            </p>
          </div>

          {/* Desktop heading */}
          <div className="hidden lg:block mb-8">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              Welcome back
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2">
              Sign in to continue to your AI workspace
            </p>
          </div>

          {/* Google Sign-In Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isGoogleLoading || isLoading}
            className="w-full bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all transform active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isGoogleLoading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <>
                <GoogleIcon className="w-5 h-5" />
                Continue with Google
              </>
            )}
          </button>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-4 bg-slate-50 dark:bg-slate-950 text-slate-400 font-medium uppercase tracking-wider">
                or
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
                  <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-enhanced pl-10"
                  placeholder="name@company.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Password
                </label>
                <button
                  type="button"
                  onClick={goToResetPassword}
                  className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium transition-colors"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-enhanced pl-10"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || isGoogleLoading}
              className="w-full btn-futuristic py-3.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed text-sm"
            >
              {isLoading ? (
                <Loader2 className="animate-spin relative z-10" size={20} />
              ) : (
                <span className="relative z-10 font-bold">Sign In</span>
              )}
            </button>
          </form>

          {/* Footer info */}
          <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center leading-relaxed">
              Sign in with Google for Knowledge Base access.<br />
              Protected by Firebase Authentication.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginRefactored;
