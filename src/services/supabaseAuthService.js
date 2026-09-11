/**
 * src/services/supabaseAuthService.js
 * Complete Supabase Authentication Service for Safety Guardian
 */

import { supabase } from '../supabase/supabase'

/**
 * Sign up a new user with Supabase Auth.
 * Automatically triggers Postgres `handle_new_user()` trigger to initialize `public.profiles`.
 */
export async function signUpWithSupabase(email, password, fullName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        name: fullName,
      },
    },
  })

  if (error) throw error
  return data.user
}

/**
 * Sign in existing user with email and password.
 */
export async function signInWithSupabase(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) throw error
  return data.user
}

/**
 * Sign in with Google OAuth via Supabase.
 */
export async function signInWithGoogleSupabase() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  })

  if (error) throw error
  return data
}

/**
 * Sign out current user.
 */
export async function signOutSupabase() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

/**
 * Get current session / user.
 */
export async function getSupabaseUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/**
 * Subscribe to Supabase auth state changes.
 */
export function onSupabaseAuthStateChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
    callback(session?.user || null, event)
  })

  return () => subscription.unsubscribe()
}
