/**
 * src/services/authService.js
 * Supabase Authentication & Profile Synchronization Service
 */

import { supabase } from '../supabase/supabase'

// Signup
export const signup = async (name, email, password) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name,
        name: name,
      },
    },
  })

  if (error) throw error

  // The Postgres trigger `on_auth_user_created` automatically initializes `public.profiles`.
  // Also ensure profile fields are synced immediately:
  if (data.user) {
    await supabase.from('profiles').upsert({
      id: data.user.id,
      full_name: name,
      email: email,
      updated_at: new Date().toISOString(),
    })
  }

  return data.user
}

// Login
export const login = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) throw error
  return data.user
}

export const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '290538642635-b9pml7iqticlug7khtk2gtq8rdeb86a3.apps.googleusercontent.com'

// Direct Google Login via your custom domain (safetyguardian.xyz)
export const googleLogin = async () => {
  const redirectUri = `${window.location.origin}/auth/callback`
  const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)

  // Store in sessionStorage, localStorage, and cross-subdomain cookie (.safetyguardian.xyz)
  try { sessionStorage.setItem('sg_google_nonce', nonce) } catch (_) {}
  try { localStorage.setItem('sg_google_nonce', nonce) } catch (_) {}
  try {
    const hostname = window.location.hostname
    const domainPart = hostname.includes('safetyguardian.xyz') ? '; domain=.safetyguardian.xyz' : ''
    document.cookie = `sg_google_nonce=${encodeURIComponent(nonce)}; path=/${domainPart}; max-age=600; SameSite=Lax`
  } catch (_) {}

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce: nonce,
    prompt: 'select_account',
  })

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

// Fallback Google Login via Supabase OAuth server redirect
export const googleLoginSupabaseFallback = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  })

  if (error) throw error
  return data
}

// Logout
export const logout = async () => {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

// Password Reset
export const resetPassword = async (email) => {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/login`,
  })
  if (error) throw error
  return data
}