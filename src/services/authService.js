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

// Google Login via OAuth
export const googleLogin = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
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