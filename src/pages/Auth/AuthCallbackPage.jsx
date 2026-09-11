import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabase/supabase';
import { useAppStore } from '../../context/store';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { setIsLoggedIn, setUser } = useAppStore();
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function handleAuthCallback() {
      try {
        // 1. Check for errors in query or hash
        const urlParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        
        const error = urlParams.get('error') || hashParams.get('error');
        const errorDesc = urlParams.get('error_description') || hashParams.get('error_description');

        if (error) {
          throw new Error(errorDesc || error || 'Authentication was cancelled or failed.');
        }

        // 2. Check for Google ID Token from Direct OIDC flow
        const idToken = hashParams.get('id_token');

        if (idToken) {
          // Read nonce from sessionStorage, localStorage, cross-subdomain cookie, or decode from token payload
          const cookieMatch = document.cookie.match(/(?:^|;\s*)sg_google_nonce=([^;]*)/);
          const cookieNonce = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;

          let tokenNonce = null;
          try {
            const parts = idToken.split('.');
            if (parts.length >= 2) {
              const base64Url = parts[1];
              const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
              const jsonStr = decodeURIComponent(
                atob(base64)
                  .split('')
                  .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                  .join('')
              );
              const payload = JSON.parse(jsonStr);
              tokenNonce = payload.nonce || null;
            }
          } catch (e) {
            console.warn('[AuthCallback] Could not parse nonce from idToken payload:', e);
          }

          const nonce =
            sessionStorage.getItem('sg_google_nonce') ||
            localStorage.getItem('sg_google_nonce') ||
            cookieNonce ||
            tokenNonce ||
            undefined;

          const { data, error: idTokenErr } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: idToken,
            nonce,
          });

          // Clean up all nonce storage
          try { sessionStorage.removeItem('sg_google_nonce'); } catch (_) {}
          try { localStorage.removeItem('sg_google_nonce'); } catch (_) {}
          try {
            const domainPart = window.location.hostname.includes('safetyguardian.xyz') ? '; domain=.safetyguardian.xyz' : '';
            document.cookie = `sg_google_nonce=; path=/${domainPart}; max-age=0`;
          } catch (_) {}

          if (idTokenErr) {
            console.error('[AuthCallback] signInWithIdToken error:', idTokenErr);
            throw idTokenErr;
          }

          if (data?.user && isMounted) {
            await syncUserProfile(data.user);
            return;
          }
        }

        // 3. Check for OAuth Access Token / Refresh Token in hash (Supabase standard)
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (accessToken) {
          const { data, error: sessionErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || '',
          });

          if (sessionErr) throw sessionErr;
          if (data?.user && isMounted) {
            await syncUserProfile(data.user);
            return;
          }
        }

        // 4. Check for PKCE Authorization Code in search query
        const code = urlParams.get('code');
        if (code) {
          const { data, error: codeErr } = await supabase.auth.exchangeCodeForSession(code);
          if (codeErr) throw codeErr;
          if (data?.user && isMounted) {
            await syncUserProfile(data.user);
            return;
          }
        }

        // 5. Fallback: check existing active Supabase session
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && isMounted) {
          await syncUserProfile(session.user);
        } else {
          throw new Error('No authentication credentials received. Please try logging in again.');
        }

      } catch (err) {
        console.error('[AuthCallback] Authentication error:', err);
        if (isMounted) {
          setErrorMessage(err.message || 'Authentication failed. Please try again.');
        }
      }
    }

    async function syncUserProfile(user) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        setUser({
          uid:         user.id,
          id:          user.id,
          name:        profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || 'Guardian User',
          email:       user.email || '',
          avatar:      profile?.avatar_url || user.user_metadata?.avatar_url || null,
          phone:       profile?.phone || user.user_metadata?.phone || '',
          memberSince: profile?.member_since || new Date(user.created_at).getFullYear().toString(),
        });

        setIsLoggedIn(true);
        navigate('/', { replace: true });
      } catch (err) {
        console.warn('[AuthCallback] Profile sync issue:', err);
        setIsLoggedIn(true);
        navigate('/', { replace: true });
      }
    }

    handleAuthCallback();

    return () => {
      isMounted = false;
    };
  }, [navigate, setIsLoggedIn, setUser]);

  if (errorMessage) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-sm w-full rounded-2xl shadow-xl border border-rose-100 p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
            <span className="material-symbols-outlined text-2xl">error</span>
          </div>
          <h2 className="text-base font-bold text-slate-900 mb-1">Authentication Failed</h2>
          <p className="text-xs text-slate-500 mb-5 leading-relaxed">{errorMessage}</p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="w-full h-10 rounded-xl bg-slate-900 text-white font-bold text-xs shadow-md active:scale-95 transition-all"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center p-6 text-white text-center">
      <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30 mb-4 animate-pulse">
        <span className="material-symbols-outlined icon-filled text-3xl">shield</span>
      </div>
      <h1 className="text-lg font-black tracking-tight mb-1">Safety Guardian</h1>
      <p className="text-xs text-blue-200/80 mb-6 font-medium">Securing your session and logging you in...</p>
      <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
    </div>
  );
}
