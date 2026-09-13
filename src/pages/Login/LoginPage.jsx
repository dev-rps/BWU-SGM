/**
 * LoginPage.jsx
 * Full Supabase Authentication Page for Safety Guardian:
 *   — Supports both Email/Password Sign In and Sign Up via interactive tabs
 *   — Google One-Tap / OAuth sign-in integration
 *   — Pixel-matched motorcycle illustration background
 *   — Forest green card (#1a4731) with smooth animations
 *   — Pill-shaped white inputs with Material symbols & visibility toggles
 *   — Remember me + Forgot password + Resend verification email handling
 *   — Demo / Guest Mode for instant access
 */
import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { login, signup, googleLogin, resetPassword, resendConfirmationEmail } from '../../services/authService'
import { useAppStore } from '../../context/store'

/* ─── CSS Keyframes & Styles ─────────────────────────────────────────────── */
const STYLES = `
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(32px); }
    to   { opacity: 1; transform: translateY(0);    }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  .login-card-anim {
    animation: slideUp 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .bg-anim {
    animation: fadeIn 0.4s ease both;
  }
  /* pill input — remove default outline, add amber focus ring */
  .pill-input {
    width: 100%;
    background: #ffffff;
    border: none;
    border-radius: 9999px;
    padding: 14px 16px 14px 48px;
    font-size: 15px;
    font-family: 'Inter', sans-serif;
    color: #191c1e;
    outline: none;
    box-shadow: 0 1px 4px rgba(0,0,0,0.10);
    transition: box-shadow 0.2s;
  }
  .pill-input:focus {
    box-shadow: 0 0 0 3px rgba(30, 64, 175, 0.25), 0 1px 4px rgba(0,0,0,0.10);
  }
  .pill-input::placeholder { color: #9ca3af; }
  /* custom checkbox */
  .remember-check {
    width: 18px; height: 18px;
    border-radius: 50%;
    border: 2px solid #d1d5db;
    appearance: none;
    cursor: pointer;
    background: #ffffff;
    transition: all 0.15s ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .remember-check:checked {
    background: #1e3a8a;
    border-color: #1e3a8a;
  }
  .remember-check:checked::after {
    content: '✓';
    color: #ffffff;
    font-size: 11px;
    font-weight: 700;
  }
`

/* ─── Mini inline Toast ───────────────────────────────────────────────────── */
function Toast({ msg, type }) {
  if (!msg) return null
  const isError = type === 'error'
  return (
    <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-[9999] ${isError ? 'bg-[#ef4444]' : 'bg-[#10B981]'} text-white text-xs font-semibold px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-2 max-w-[90vw] text-center`}>
      <span className="material-symbols-outlined text-[18px]">
        {isError ? 'error' : 'check_circle'}
      </span>
      <span>{msg}</span>
    </div>
  )
}

const BG_IMG = '/login-bg.jpg'

/* ─── Main Component ──────────────────────────────────────────────────────── */
export default function LoginPage({ initialMode }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setIsLoggedIn, setIsDemoMode, setUser } = useAppStore()

  // Determine initial mode: prop > query param > 'login'
  const urlMode = searchParams.get('mode') || searchParams.get('tab')
  const [mode, setMode] = useState(initialMode || (urlMode === 'signup' ? 'signup' : 'login'))

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [unconfirmedEmail, setUnconfirmedEmail] = useState(null)
  const [toast, setToast] = useState({ msg: '', type: '' })

  // ── Restore remembered email on mount ──────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('sg_remember_email')
    if (saved) {
      setEmail(saved)
      setRememberMe(true)
    }
  }, [])

  // ── Sync mode if initialMode changes ───────────────────────────────────
  useEffect(() => {
    if (initialMode) setMode(initialMode)
  }, [initialMode])

  /* ── Toast helper ────────────────────────────────────────────────────── */
  const showToast = (msg, type = 'error', ms = 3500) => {
    setToast({ msg, type })
    setTimeout(() => setToast({ msg: '', type: '' }), ms)
  }

  /* ── Email/Password Login via Supabase ─────────────────────────────────── */
  const handleLogin = async (e) => {
    e.preventDefault()
    if (!email.trim()) return showToast('Please enter your email.')
    if (!password.trim()) return showToast('Please enter your password.')

    setProcessing(true)
    try {
      await login(email.trim(), password)

      if (rememberMe) localStorage.setItem('sg_remember_email', email.trim())
      else localStorage.removeItem('sg_remember_email')

      setIsLoggedIn(true)
      navigate('/')
    } catch (err) {
      const msg = err.message || ''
      if (msg.toLowerCase().includes('email not confirmed')) {
        setUnconfirmedEmail(email.trim())
        showToast('Email not confirmed yet. Check your inbox or click Resend below.', 'error', 5500)
      } else if (msg.toLowerCase().includes('invalid login credentials')) {
        showToast('Invalid email or password. Please verify or create an account.', 'error', 4000)
      } else {
        showToast(msg || 'Login failed. Check your credentials.')
      }
    }
    setProcessing(false)
  }

  /* ── Email/Password Sign Up via Supabase ───────────────────────────────── */
  const handleSignup = async (e) => {
    e.preventDefault()
    if (!fullName.trim()) return showToast('Please enter your full name.')
    if (!email.trim()) return showToast('Please enter your email address.')
    if (!password.trim()) return showToast('Please create a password.')
    if (password.length < 6) return showToast('Password must be at least 6 characters.')

    setProcessing(true)
    try {
      const res = await signup(fullName.trim(), email.trim(), password)

      if (res?.session) {
        showToast('Account created successfully! Welcome to Safety Guardian.', 'success', 2500)
        setIsLoggedIn(true)
        setTimeout(() => navigate('/'), 1200)
      } else {
        // Email confirmation is required by Supabase project settings
        showToast('Account registered! Please check your email to confirm your account, then log in.', 'success', 6000)
        setUnconfirmedEmail(email.trim())
        setMode('login')
      }
    } catch (err) {
      const msg = err.message || ''
      if (msg.toLowerCase().includes('rate limit')) {
        showToast('Email rate limit reached on Supabase. Please wait a few minutes, or sign in if already registered.', 'error', 6000)
      } else if (msg.toLowerCase().includes('already registered')) {
        showToast('An account with this email already exists. Switching to Sign In.', 'error', 4000)
        setMode('login')
      } else {
        showToast(msg || 'Sign up failed. Please try again.')
      }
    }
    setProcessing(false)
  }

  /* ── Resend Email Confirmation ────────────────────────────────────────── */
  const handleResendConfirmation = async () => {
    const target = unconfirmedEmail || email.trim()
    if (!target) return showToast('Please enter your email address first.')
    try {
      await resendConfirmationEmail(target)
      showToast('Confirmation email resent! Please check your inbox.', 'success', 4500)
    } catch (err) {
      showToast(err.message || 'Failed to resend confirmation email.')
    }
  }

  /* ── Google Login via Supabase ─────────────────────────────────────────── */
  const handleGoogleLogin = async () => {
    setProcessing(true)
    try {
      await googleLogin()
    } catch (err) {
      console.error('[Google sign-in error]:', err)
      showToast(err.message || 'Google sign-in failed. Please try again.')
      setProcessing(false)
    }
  }

  /* ── Forgot Password via Supabase ──────────────────────────────────────── */
  const handleForgotPassword = async () => {
    if (!email.trim()) return showToast('Enter your email in the field above first.')
    try {
      await resetPassword(email.trim())
      showToast('Password reset email sent! Check your inbox.', 'success', 4000)
    } catch (err) {
      showToast(err.message || 'Failed to send reset email.')
    }
  }

  /* ── Demo / Guest Login ─────────────────────────────────────────────────── */
  const handleGuestLogin = () => {
    setIsDemoMode(true)
    setIsLoggedIn(true)
    setUser({
      name: 'Guest Guardian',
      email: 'guest@safetyguardian.app',
      avatar: null,
      phone: '',
      memberSince: new Date().getFullYear().toString(),
    })
    navigate('/')
  }

  /* ── Render ───────────────────────────────────────────────────────────── */
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <Toast msg={toast.msg} type={toast.type} />

      {/* ── Full-bleed background ── */}
      <div
        className="bg-anim fixed inset-0 z-50"
        style={{
          backgroundImage: `url('${BG_IMG}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />

      {/* ── Light vignette ── */}
      <div className="fixed inset-0 z-[51]" style={{ background: 'rgba(15,23,42,0.12)' }} />

      {/* ── Main layout — card right-aligned ── */}
      <main
        className="relative z-[52] min-h-screen flex items-center justify-end"
        style={{ padding: '24px 5vw' }}
      >
        {/* ═══════════════ AUTH CARD ═══════════════ */}
        <div
          className="login-card-anim w-full flex flex-col"
          style={{
            maxWidth: 420,
            background: '#1a4731',       /* dark forest green */
            borderRadius: 28,
            padding: '32px 28px 28px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
          }}
        >
          {/* Brand header */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <p style={{
              fontFamily: "'Hanken Grotesk', 'Inter', sans-serif",
              fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
              textTransform: 'uppercase', color: '#86efac',
              marginBottom: 6,
            }}>🛡️ Safety Guardian</p>
            <h1 style={{
              fontFamily: "'Hanken Grotesk', 'Inter', sans-serif",
              fontSize: 24, fontWeight: 800, color: '#ffffff',
              lineHeight: 1.2, margin: 0,
            }}>
              {mode === 'signup' ? 'Create Account' : 'Welcome, Traveller!'}
            </h1>
            <p style={{
              fontSize: 13, color: '#a7f3d0', marginTop: 4, marginBottom: 0,
              fontFamily: "'Inter', sans-serif",
            }}>
              {mode === 'signup'
                ? 'Sign up with email & password or Google'
                : 'Sign in with your email & password or Google'}
            </p>
          </div>

          {/* ── Tab Switcher: Sign In / Sign Up ── */}
          <div style={{
            display: 'flex',
            background: 'rgba(0, 0, 0, 0.25)',
            borderRadius: 9999,
            padding: 4,
            marginBottom: 20,
          }}>
            <button
              type="button"
              onClick={() => { setMode('login'); setToast({ msg: '', type: '' }); }}
              style={{
                flex: 1,
                padding: '9px 16px',
                borderRadius: 9999,
                fontSize: 13,
                fontWeight: 700,
                fontFamily: "'Hanken Grotesk', 'Inter', sans-serif",
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                background: mode === 'login' ? '#ffffff' : 'transparent',
                color: mode === 'login' ? '#1a4731' : '#d1fae5',
                boxShadow: mode === 'login' ? '0 2px 8px rgba(0,0,0,0.18)' : 'none',
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); setToast({ msg: '', type: '' }); }}
              style={{
                flex: 1,
                padding: '9px 16px',
                borderRadius: 9999,
                fontSize: 13,
                fontWeight: 700,
                fontFamily: "'Hanken Grotesk', 'Inter', sans-serif",
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                background: mode === 'signup' ? '#ffffff' : 'transparent',
                color: mode === 'signup' ? '#1a4731' : '#d1fae5',
                boxShadow: mode === 'signup' ? '0 2px 8px rgba(0,0,0,0.18)' : 'none',
              }}
            >
              Sign Up
            </button>
          </div>

          {/* ── Unconfirmed Email Notice Banner ── */}
          {unconfirmedEmail && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: 14,
              padding: '10px 14px',
              marginBottom: 16,
              fontSize: 12,
              color: '#fecaca',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}>
              <span>Need confirmation link?</span>
              <button
                type="button"
                onClick={handleResendConfirmation}
                style={{
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: 9999,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Resend Email
              </button>
            </div>
          )}

          {/* ── Form: Login or Sign Up ── */}
          <form onSubmit={mode === 'signup' ? handleSignup : handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* ── Full Name (Only on Sign Up) ── */}
            {mode === 'signup' && (
              <div style={{ position: 'relative' }}>
                <span
                  className="material-symbols-outlined"
                  style={{
                    position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
                    color: '#6b7280', fontSize: 20, pointerEvents: 'none',
                  }}
                >badge</span>
                <input
                  className="pill-input"
                  id="fullname"
                  type="text"
                  placeholder="Full Name"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  autoComplete="name"
                  required
                />
              </div>
            )}

            {/* ── Email Field ── */}
            <div style={{ position: 'relative' }}>
              <span
                className="material-symbols-outlined"
                style={{
                  position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
                  color: '#6b7280', fontSize: 20, pointerEvents: 'none',
                }}
              >{mode === 'signup' ? 'mail' : 'person'}</span>
              <input
                className="pill-input"
                id="email"
                type="email"
                placeholder={mode === 'signup' ? 'Email Address' : 'Email Address'}
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            {/* ── Password Field ── */}
            <div style={{ position: 'relative' }}>
              <span
                className="material-symbols-outlined"
                style={{
                  position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
                  color: '#6b7280', fontSize: 20, pointerEvents: 'none',
                }}
              >lock</span>
              <input
                className="pill-input"
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder={mode === 'signup' ? 'Password (min. 6 characters)' : 'Password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                style={{ paddingRight: 48 }}
                required
              />
              {/* Eye toggle */}
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                style={{
                  position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280',
                  display: 'flex', alignItems: 'center',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>

            {/* ── Remember me + Forget password (Only in Sign In mode) ── */}
            {mode === 'login' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    className="remember-check"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                  />
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#d1fae5', fontFamily: 'Inter, sans-serif' }}>
                    Remember me
                  </span>
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 500, color: '#86efac',
                    fontFamily: 'Inter, sans-serif',
                    textDecoration: 'underline', textUnderlineOffset: 3,
                  }}
                >
                  Forget password?
                </button>
              </div>
            )}

            {/* ── Primary Submit Button (Login / Sign Up) ── */}
            <button
              type="submit"
              disabled={processing}
              style={{
                marginTop: 6,
                width: '100%',
                background: '#1e3a8a',      /* dark navy */
                color: '#ffffff',
                border: 'none',
                borderRadius: 9999,
                padding: '15px 24px',
                fontSize: 16,
                fontWeight: 700,
                fontFamily: "'Hanken Grotesk', 'Inter', sans-serif",
                cursor: processing ? 'not-allowed' : 'pointer',
                opacity: processing ? 0.75 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'transform 0.15s, opacity 0.15s',
                boxShadow: '0 4px 16px rgba(30,58,138,0.35)',
              }}
              onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)' }}
              onMouseUp={e   => { e.currentTarget.style.transform = 'scale(1)'    }}
            >
              {processing ? (
                <svg className="animate-spin" style={{ width: 22, height: 22, color: 'white' }} fill="none" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" style={{ opacity: 0.25 }} />
                  <path fill="currentColor" style={{ opacity: 0.75 }} d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : mode === 'signup' ? 'Create Account' : 'Sign In with Email'}
            </button>
          </form>

          {/* ── "or sign in with" divider ── */}
          <div style={{ textAlign: 'center', margin: '18px 0 12px', fontSize: 13, color: '#86efac', fontFamily: 'Inter, sans-serif' }}>
            or continue with
          </div>

          {/* ── Social buttons row ── */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
            {/* Google OAuth */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={processing}
              title="Continue with Google"
              style={{
                width: 44, height: 44, borderRadius: '50%',
                background: '#ffffff',
                border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'    }}
            >
              {/* Google "G" logo */}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            </button>

            {/* Facebook */}
            <button
              type="button"
              title="Continue with Facebook (coming soon)"
              style={{
                width: 44, height: 44, borderRadius: '50%',
                background: '#1877F2',
                border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                transition: 'transform 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'    }}
              onClick={() => showToast('Facebook login coming soon!', 'error', 2000)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.27h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
              </svg>
            </button>

            {/* Twitter / X */}
            <button
              type="button"
              title="Continue with X (coming soon)"
              style={{
                width: 44, height: 44, borderRadius: '50%',
                background: '#000000',
                border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                transition: 'transform 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'    }}
              onClick={() => showToast('X login coming soon!', 'error', 2000)}
            >
              <svg width="20" height="20" viewBox="0 0 300 300" fill="white">
                <path d="M178.57 127.15L290.27 0h-26.46l-97.03 110.38L89.34 0H0l117.13 166.93L0 300.25h26.46l102.4-116.59 81.8 116.59H300L178.57 127.15zm-36.32 41.36-11.88-16.67L36.16 19.49h40.67l76.37 107.12 11.88 16.67 99.21 139.26h-40.67l-81.38-114.03z"/>
              </svg>
            </button>
          </div>

          {/* ── Switcher between Login & Sign up ── */}
          <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, fontFamily: 'Inter, sans-serif', color: '#d1fae5' }}>
            {mode === 'signup' ? (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('login'); setToast({ msg: '', type: '' }); }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontWeight: 700, color: '#86efac', textDecoration: 'underline', textUnderlineOffset: 3,
                    fontFamily: 'Inter, sans-serif', fontSize: 13,
                  }}
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                New user?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('signup'); setToast({ msg: '', type: '' }); }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontWeight: 700, color: '#86efac', textDecoration: 'underline', textUnderlineOffset: 3,
                    fontFamily: 'Inter, sans-serif', fontSize: 13,
                  }}
                >
                  Create an account
                </button>
              </>
            )}
          </div>

          {/* ── Demo / Guest login button ── */}
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <button
              type="button"
              onClick={handleGuestLogin}
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#ffffff',
                background: 'rgba(255,255,255,0.18)',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 9999,
                padding: '6px 16px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.28)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)' }}
            >
              Continue as Guest / Demo Mode &rarr;
            </button>
          </div>
        </div>
      </main>
    </>
  )
}
