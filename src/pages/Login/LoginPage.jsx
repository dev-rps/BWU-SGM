/**
 * LoginPage.jsx
 * Exact pixel-match of the Stitch design:
 *   — Full-bleed motorcycle illustration background (blue waves + rider)
 *   — Amber/yellow (#F59E0B) login card aligned to the right
 *   — Pill-shaped white inputs (Username/Email + Password with eye toggle)
 *   — Remember me checkbox  +  Forget password? link
 *   — Dark navy "Login" button (email/password)
 *   — "or sign up using" divider with Google icon button
 *   — "New user? Sign up" footer link
 *
 * All actions wired to Firebase Auth:
 *   handleLogin          → signInWithEmailAndPassword
 *   handleGoogleLogin    → signInWithPopup (Google)
 *   handleForgotPassword → sendPasswordResetEmail
 *   rememberMe           → persists email in localStorage
 */
import React, { useState, useEffect } from 'react'
import { useNavigate, Link }           from 'react-router-dom'
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth'
import { auth, googleProvider } from '../../firebase/firebase'
import { useAppStore }           from '../../context/store'

/* ─── Keyframes injected once ─────────────────────────────────────────────── */
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
    -webkit-appearance: none;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
  }
  .remember-check:checked {
    background: #1e3a8a;
    border-color: #1e3a8a;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M2 5l2.5 2.5L8 3' stroke='white' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: center;
    background-size: 10px;
  }
  /* toast */
  .toast {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: #1e293b; color: white; padding: 10px 20px;
    border-radius: 9999px; font-size: 13px; font-weight: 600;
    z-index: 9999; white-space: nowrap;
    animation: slideUp 0.3s cubic-bezier(0.22,1,0.36,1) both;
  }
  .toast.error { background: #dc2626; }
  .toast.success { background: #059669; }
`

/* ─── Toast helper ─────────────────────────────────────────────────────────── */
function Toast({ msg, type }) {
  if (!msg) return null
  return <div className={`toast ${type}`}>{msg}</div>
}

/* ─── Motorcycle background image URL (from Stitch) ───────────────────────── */
const BG_IMG = '/login-bg.jpg'

export default function LoginPage() {
  const navigate       = useNavigate()
  const { setIsLoggedIn, setUser, setHasPermissions, setIsDemoMode } = useAppStore()

  const handleGuestLogin = () => {
    setUser({
      name: 'Guest Guardian (Demo)',
      email: 'guardian@safety.app',
      avatar: null,
      phone: '+91 98765 43210',
      memberSince: '2026',
    })
    setIsLoggedIn(true)
    setIsDemoMode(true)
    setHasPermissions(false)
    navigate('/permissions')
  }

  // ── Form state ──────────────────────────────────────────────────────────
  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [showPwd,     setShowPwd]     = useState(false)
  const [rememberMe,  setRememberMe]  = useState(false)
  const [processing,  setProcessing]  = useState(false)
  const [toast,       setToast]       = useState({ msg: '', type: '' })

  // ── Restore remembered email ─────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('sg_remember_email')
    if (saved) { setEmail(saved); setRememberMe(true) }
  }, [])

  /* ── Toast helper ────────────────────────────────────────────────────── */
  const showToast = (msg, type = 'error', ms = 3000) => {
    setToast({ msg, type })
    setTimeout(() => setToast({ msg: '', type: '' }), ms)
  }

  /* ── Email/Password Login ─────────────────────────────────────────────── */
  const handleLogin = async (e) => {
    e.preventDefault()
    if (!email.trim())    return showToast('Please enter your email.')
    if (!password.trim()) return showToast('Please enter your password.')

    setProcessing(true)
    try {
      // Set persistence based on "Remember me"
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence)
      await signInWithEmailAndPassword(auth, email, password)

      if (rememberMe) localStorage.setItem('sg_remember_email', email)
      else            localStorage.removeItem('sg_remember_email')

      setIsLoggedIn(true)
      navigate('/')
    } catch (err) {
      const msg = err.code === 'auth/user-not-found'    ? 'No account found with this email.'
                : err.code === 'auth/wrong-password'    ? 'Incorrect password. Try again.'
                : err.code === 'auth/invalid-email'     ? 'Invalid email address.'
                : err.code === 'auth/too-many-requests' ? 'Too many attempts. Try again later.'
                : 'Login failed. Check your credentials.'
      showToast(msg)
    }
    setProcessing(false)
  }

  /* ── Google Login ─────────────────────────────────────────────────────── */
  const handleGoogleLogin = async () => {
    setProcessing(true)
    try {
      await signInWithPopup(auth, googleProvider)
      setIsLoggedIn(true)
      navigate('/')
    } catch (err) {
      console.error('[Google sign-in error]:', err)
      if (err.code === 'auth/popup-closed-by-user') {
        // User closed popup; no error needed
      } else if (err.code === 'auth/unauthorized-domain') {
        showToast('Domain not authorized in Firebase Console (Authentication > Settings > Authorized domains).', 'error', 6000)
      } else if (err.code === 'auth/operation-not-allowed') {
        showToast('Google provider is disabled in Firebase Console (Authentication > Sign-in method).', 'error', 6000)
      } else if (err.code === 'auth/popup-blocked') {
        showToast('Sign-in popup was blocked by browser. Please allow popups.', 'error', 5000)
      } else {
        showToast(err.message || 'Google sign-in failed. Try again.', 'error', 5000)
      }
    }
    setProcessing(false)
  }

  /* ── Forgot Password ──────────────────────────────────────────────────── */
  const handleForgotPassword = async () => {
    if (!email.trim()) return showToast('Enter your email above first.')
    try {
      await sendPasswordResetEmail(auth, email)
      showToast('Reset email sent! Check your inbox.', 'success', 4000)
    } catch (err) {
      showToast(err.code === 'auth/user-not-found' ? 'No account with that email.' : 'Failed to send reset email.')
    }
  }

  /* ── Render ───────────────────────────────────────────────────────────── */
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <Toast msg={toast.msg} type={toast.type} />

      {/* ── Full-bleed background — covers the Leaflet map completely ── */}
      <div
        className="bg-anim fixed inset-0 z-50"
        style={{
          backgroundImage: `url('${BG_IMG}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />

      {/* ── Light vignette so card pops ── */}
      <div className="fixed inset-0 z-[51]" style={{ background: 'rgba(15,23,42,0.10)' }} />

      {/* ── Main layout — card right-aligned ── */}
      <main
        className="relative z-[52] min-h-screen flex items-center justify-end"
        style={{ padding: '24px 5vw' }}
      >
        {/* ═══════════════ LOGIN CARD ═══════════════ */}
        <div
          className="login-card-anim w-full flex flex-col"
          style={{
            maxWidth: 400,
            background: '#1a4731',       /* dark forest green */
            borderRadius: 28,
            padding: '36px 32px 32px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
          }}
        >
          {/* Brand header */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <p style={{
              fontFamily: "'Hanken Grotesk', 'Inter', sans-serif",
              fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
              textTransform: 'uppercase', color: '#86efac',
              marginBottom: 6,
            }}>🛡️ Safety Guardian</p>
            <h1 style={{
              fontFamily: "'Hanken Grotesk', 'Inter', sans-serif",
              fontSize: 26, fontWeight: 800, color: '#ffffff',
              lineHeight: 1.2, margin: 0,
            }}>Welcome, Traveller!</h1>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* ── Username/Email ── */}
            <div style={{ position: 'relative' }}>
              <span
                className="material-symbols-outlined"
                style={{
                  position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
                  color: '#6b7280', fontSize: 20, pointerEvents: 'none',
                }}
              >person</span>
              <input
                className="pill-input"
                id="email"
                type="email"
                placeholder="Username/Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            {/* ── Password ── */}
            <div style={{ position: 'relative' }}>
              <span
                className="material-symbols-outlined"
                style={{
                  position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
                  color: '#6b7280', fontSize: 20, pointerEvents: 'none',
                }}
              >visibility</span>
              <input
                className="pill-input"
                id="password"
                type={showPwd ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                style={{ paddingRight: 48 }}
                required
              />
              {/* Eye toggle */}
              <button
                type="button"
                onClick={() => setShowPwd(v => !v)}
                style={{
                  position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280',
                  display: 'flex', alignItems: 'center',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                  {showPwd ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>

            {/* ── Remember me + Forget password ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  className="remember-check"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                />
                <span style={{ fontSize: 14, fontWeight: 500, color: '#d1fae5', fontFamily: 'Inter, sans-serif' }}>
                  Remember me
                </span>
              </label>
              <button
                type="button"
                onClick={handleForgotPassword}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 14, fontWeight: 500, color: '#86efac',
                  fontFamily: 'Inter, sans-serif',
                  textDecoration: 'underline', textUnderlineOffset: 3,
                }}
              >
                Forget password?
              </button>
            </div>

            {/* ── Login Button ── */}
            <button
              type="submit"
              disabled={processing}
              style={{
                marginTop: 8,
                width: '100%',
                background: '#1e3a8a',      /* dark navy — exact match */
                color: '#ffffff',
                border: 'none',
                borderRadius: 9999,
                padding: '16px 24px',
                fontSize: 18,
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
              ) : 'Login'}
            </button>
          </form>

          {/* ── "or sign up using" divider ── */}
          <div style={{ textAlign: 'center', margin: '20px 0 12px', fontSize: 13, color: '#86efac', fontFamily: 'Inter, sans-serif' }}>
            or sign up using
          </div>

          {/* ── Social buttons row ── */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
            {/* Google */}
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
              {/* Facebook "f" */}
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
              {/* X logo */}
              <svg width="20" height="20" viewBox="0 0 300 300" fill="white">
                <path d="M178.57 127.15L290.27 0h-26.46l-97.03 110.38L89.34 0H0l117.13 166.93L0 300.25h26.46l102.4-116.59 81.8 116.59H300L178.57 127.15zm-36.32 41.36-11.88-16.67L36.16 19.49h40.67l76.37 107.12 11.88 16.67 99.21 139.26h-40.67l-81.38-114.03z"/>
              </svg>
            </button>
          </div>

          {/* ── Sign up link ── */}
          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 14, fontFamily: 'Inter, sans-serif', color: '#d1fae5' }}>
            New user?{' '}
            <Link
              to="/signup"
              style={{ fontWeight: 700, color: '#86efac', textDecoration: 'underline', textUnderlineOffset: 3 }}
            >
              Sign up
            </Link>
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
                background: 'rgba(255,255,255,0.2)',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: 9999,
                padding: '6px 16px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.3)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)' }}
            >
              Continue as Guest / Demo Mode &rarr;
            </button>
          </div>
        </div>
      </main>
    </>
  )
}
