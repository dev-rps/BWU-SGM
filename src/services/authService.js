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

// Cryptographic Nonce generation and SHA-256 hashing for Supabase & Google OIDC
export const generateRawNonce = () => {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export const sha256Hex = async (str) => {
  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer), b => b.toString(16).padStart(2, '0')).join('')
}

// Direct Google Login via your custom domain (safetyguardian.xyz)
export const googleLogin = async () => {
  const redirectUri = `${window.location.origin}/auth/callback`
  const rawNonce = generateRawNonce()
  const hashedNonce = await sha256Hex(rawNonce)

  // Store rawNonce in sessionStorage, localStorage, and cross-subdomain cookie (.safetyguardian.xyz)
  try { sessionStorage.setItem('sg_google_nonce', rawNonce) } catch (_) {}
  try { localStorage.setItem('sg_google_nonce', rawNonce) } catch (_) {}
  try {
    const hostname = window.location.hostname
    const domainPart = hostname.includes('safetyguardian.xyz') ? '; domain=.safetyguardian.xyz' : ''
    document.cookie = `sg_google_nonce=${encodeURIComponent(rawNonce)}; path=/${domainPart}; max-age=600; SameSite=Lax`
  } catch (_) {}

  // Send the SHA-256 HASHED nonce to Google; Supabase will verify using rawNonce
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce: hashedNonce,
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