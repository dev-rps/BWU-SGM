/**
 * src/supabase/supabase.js
 * Supabase Client Initialization & Integration Gateway for Safety Guardian
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vfunoewloaiotgblcpvw.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmdW5vZXdsb2Fpb3RnYmxjcHZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxMDg5MzAsImV4cCI6MjEwNDY4NDkzMH0.jxf1IVbTr4bQ4okA4oO8zC5yxdFIHwQKyYCQsdUqLKk'

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export default supabase
