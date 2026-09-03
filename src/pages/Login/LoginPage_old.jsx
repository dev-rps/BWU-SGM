import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../../firebase/firebase';
import { useAppStore } from '../../context/store';

const LoginPage = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const [email, setEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
const [password, setPassword] = useState("");

const navigate = useNavigate(); 
const { setIsLoggedIn } = useAppStore();
const handleLogin = async (e) => {
  e.preventDefault();

  setIsProcessing(true);

  try {
    await signInWithEmailAndPassword(auth, email, password);

    setIsLoggedIn(true);

    navigate("/");
  } catch (error) {
    alert(error.message);
  }

  setIsProcessing(false);
};
const handleGoogleLogin = async () => {
  try {
    await signInWithPopup(auth, googleProvider);

    setIsLoggedIn(true);

    navigate("/");
  } catch (error) {
    alert(error.message);
  }
};

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        .glass-panel {
            background: rgba(255, 255, 255, 0.7);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.3);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
        }
        .map-mesh {
            background-image: 
                radial-gradient(circle at 2px 2px, rgba(0,0,0,0.05) 1px, transparent 0);
            background-size: 24px 24px;
        }
        .material-symbols-outlined {
            font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
            display: inline-block;
            vertical-align: middle;
        }
        .floating-anim {
            animation: floating 6s ease-in-out infinite;
        }
        @keyframes floating {
            0% { transform: translateY(0px); }
            50% { transform: translateY(-10px); }
            100% { transform: translateY(0px); }
        }
      `}} />
      
      <div className="bg-[#f7f9fb] text-[#191c1e] font-body-lg selection:bg-[#dbe1ff] selection:text-[#00174b] min-h-screen">
        <div className="fixed inset-0 z-[0] bg-[#f7f9fb] overflow-hidden">
          <div className="absolute inset-0 map-mesh opacity-40"></div>
          <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-[#004ac6]/10 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[-5%] left-[-5%] w-[50%] h-[50%] bg-[#10B981]/10 rounded-full blur-[100px]"></div>
        </div>

        <main className="min-h-screen flex flex-col items-center justify-center p-[16px] relative z-10">
          <div className="w-full max-w-md flex flex-col gap-10">
            <div className="flex flex-col items-center text-center gap-2 mb-2 h-[210px] justify-center">
              <div className="h-[120px] flex items-center justify-center">
                <img 
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDJ-S_R9oqs4CoQY1jLcIQ8CAhpIcko2biHSrzMXfLDMTDvJNs9liY81rqcapCvOjWc1n_khpAXwOn1zeRYab3wvQRf_nzJkjC-Os49QYlBcCHtLPEa_lhrg3Q6QllRLACHwx4XNpDlIMkumop4BgIj8U6LOyIyqbxHF1m7BaJo1A_5jb6c8z-HerA9eWm9xGfBKtEihyyokTNuDefqoX9yRmylScqf6NIJ4xv3ZTTZX1fGu_Z-33V5w4SRfYgHhQzlwFM" 
                  alt="Safety Map Logo" 
                  className="h-full object-contain"
                />
              </div>
              <div className="space-y-0 flex flex-col items-center justify-end h-[80px]">
                <h1 className="font-bold" style={{ fontSize: '40px', color: '#1B4332', lineHeight: 1 }}>Welcome!</h1>
                <p className="font-bold" style={{ fontSize: '24px', color: '#2563EB' }}>Let's get you home safely.</p>
              </div>
            </div>

            <div className="glass-panel rounded-[24px] p-[24px] space-y-[16px] transition-all duration-300">
              <form className="space-y-[16px]" id="loginForm" onSubmit={handleLogin}>
                <div className="space-y-[4px]">
                  <label className="font-['Inter'] text-[12px] font-semibold text-[#434655] ml-2" htmlFor="email">
                    Email Address
                  </label>
                  <div className={`relative group ${isEmailFocused ? 'scale-[1.01]' : ''} transition-transform`}>
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#737686] group-focus-within:text-[#004ac6] transition-colors">
                      alternate_email
                    </span>
                    <input
                    className="w-full bg-[#ffffff]/50 border-none rounded-xl py-4 pl-12 pr-4 font-['Inter'] text-[14px] focus:ring-2 focus:ring-[#004ac6]/20 transition-all placeholder:text-[#737686]/50 shadow-sm"
                    id="email"
                    placeholder="name@safety.com"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setIsEmailFocused(true)}
                    onBlur={() => setIsEmailFocused(false)}
                    />
                  </div>
                </div>

                <div className="space-y-[4px]">
                  <div className="flex justify-between items-center px-2">
                    <label className="font-['Inter'] text-[12px] font-semibold text-[#434655]" htmlFor="password">
                      Password
                    </label>
                    <a className="font-['Inter'] text-[12px] font-semibold text-[#004ac6] hover:underline" href="#">
                      Forgot?
                    </a>
                  </div>
                  <div className={`relative group ${isPasswordFocused ? 'scale-[1.01]' : ''} transition-transform`}>
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#737686] group-focus-within:text-[#004ac6] transition-colors">
                      lock
                    </span>
                    <input
                    className="w-full bg-[#ffffff]/50 border-none rounded-xl py-4 pl-12 pr-12 font-['Inter'] text-[14px] focus:ring-2 focus:ring-[#004ac6]/20 transition-all placeholder:text-[#737686]/50 shadow-sm"
                    id="password"
                    placeholder="••••••••"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setIsPasswordFocused(true)}
                    onBlur={() => setIsPasswordFocused(false)}
                    />
                    <button
  type="button"
  onClick={() => setShowPassword(!showPassword)}
  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#737686] hover:text-[#191c1e] transition-colors"
>
  <span className="material-symbols-outlined">
    {showPassword ? "visibility_off" : "visibility"}
  </span>
</button>
                  </div>
                </div>

                <div className="pt-[4px]">
                  <button 
                    className="w-full bg-[#004ac6] hover:bg-[#004ac6]/90 text-[#ffffff] font-['Inter'] text-[12px] font-semibold py-4 rounded-xl shadow-lg shadow-[#004ac6]/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2" 
                    type="submit"
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <>
                        <svg className="animate-spin h-5 w-5 text-[#ffffff]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Processing...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[20px]">login</span>
                        Login
                      </>
                    )}
                  </button>
                </div>
              </form>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-[#737686]/10"></span>
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-transparent px-4 font-['Inter'] text-[10px] font-bold text-[#737686] uppercase tracking-widest">
                    Or Safely Join With
                  </span>
                </div>
              </div>
              <button
              onClick={handleGoogleLogin}
              className="w-full bg-white hover:bg-[#f2f4f6] text-[#191c1e] border border-[#c3c6d7] font-['Inter'] text-[12px] font-semibold py-4 rounded-xl flex items-center justify-center gap-3 transition-colors shadow-sm"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"></path>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"></path>
                </svg>
                Continue with Google
              </button>

              <div className="text-center pt-2">
                <span className="font-['Inter'] text-[14px] text-[#434655]">Don't have an account? </span>
                <Link
                to="/signup"
                className="text-[#004ac6] font-bold hover:underline decoration-2 underline-offset-4"
                >
                  Sign Up
                  </Link>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
};

export default LoginPage;