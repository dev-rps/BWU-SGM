import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from "../firebase/firebase.js";
import { signInWithPopup } from 'firebase/auth';

const SignUpPage = () => {
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('');
  const [isFullNameFocused, setIsFullNameFocused] = useState(false);
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);

  const handleSubmit = async (e) => {
  e.preventDefault();

  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    await updateProfile(userCredential.user, {
      displayName: fullName,
    });

    await setDoc(doc(db, "users", userCredential.user.uid), {
      uid: userCredential.user.uid,
      name: fullName,
      email,
      createdAt: new Date(),
    });

    alert("Account created successfully!");
    navigate("/");
  } catch (error) {
    alert(error.message);
  }
};

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        .glass-panel {
            background: rgba(255, 255, 255, 0.7);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.3);
        }
        
        .material-symbols-outlined {
            font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }

        .map-bg {
            position: fixed;
            inset: 0;
            z-index: -1;
            background-color: #f0f2f5;
        }

        .spring-animate:active {
            transform: scale(0.95);
            transition: transform 0.1s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        input:focus {
            outline: none;
            box-shadow: 0 0 0 2px rgba(0, 74, 198, 0.2);
        }
      `}} />

      <div className="bg-[#f7f9fb] text-[#191c1e] font-body-lg min-h-screen flex flex-col items-center justify-center p-4">
        {/* Ambient Map Background (Simulated) */}
        <div 
          className="map-bg" 
          data-alt="A high-fidelity, soft-focused map interface showing a lush urban environment in West Bengal. The aesthetic is clean and modern, featuring minimalist road lines in slate grey and emerald green park areas. The lighting is bright and airy, typical of a professional navigation app with a premium light-mode finish." 
          data-location="West Bengal, India" 
          style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuBOvLg52fexBdnGeDh2mDH5bSul2AeDRl9NGGWvJwkZDyIQK2En0zEmUHmv9i8kef_O4WEuPMhy9F8qujiG_pz8t3MGr-C2canz-eBeJ3-V_sP1KH6d8V99mlJbxgpgBxRsZTNSFIm0hcQkfpVR11RB1eLm9qhP-kxoS5DR3IOdz1cHw6r50pNUEyOykfjhATaSBnjLPvWLmQ5SFX2ZWkkBW8P9Y3EZspDWPAs9_IxtEW-JQ4sWWsrclQ")' }}
        >
          <div className="absolute inset-0 bg-white/15 backdrop-blur-[6px] transition-all duration-700"></div>
        </div>

        {/* Main Content Canvas */}
        <main className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* Logo Section */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-20 h-20 mb-6 drop-shadow-xl">
              <img 
                alt="Safety Map Logo" 
                className="w-full h-full object-contain" 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAqSjd8v9SUEFI4A8l2UME9V5cUCVK_b8EdNo-9j6j2UU2XE5wKc24epEgPLixe9D5JvnyBOkZmw_fkY_rKeZgaKWV1f0s35GmO2lD612HdRG-xvYBclGCA7lY3DuvLAnhsSXECBkLKbNS0G0Orjbe0SHFD2kHTWElAIvJA0YZyAC-sMwuYno76FcoDohV8avNKX12QeelkMZ0F-bcagEnAj_1UA2k0LncE5pr2syD6j7d_Uz0gqxIjFip5T01JO9GEj7I" 
              />
            </div>
            <h1 className="font-['Inter'] text-[24px] leading-[30px] md:text-[28px] md:leading-[34px] text-[#191c1e] text-center px-4 font-bold">
              Every journey starts with a safer choice.<br/>
              <span 
                className="block mt-2 font-semibold italic tracking-wider drop-shadow-sm text-[10px] leading-[12px] whitespace-nowrap" 
                style={{ color: 'rgb(27, 67, 50)' }}
              >
                "Because your safety is worth every extra minute."
              </span>
            </h1>
          </div>

          {/* Registration Card */}
          <div className="glass-panel rounded-3xl p-[16px] shadow-lg mb-8 border-white/40">
            <form action="#" className="gap-4 flex flex-col" method="POST" onSubmit={handleSubmit}>
              
              {/* Full Name Field */}
              <div className="space-y-1">
                <label className="font-['Inter'] text-[12px] font-semibold tracking-[0.02em] text-[#434655] ml-1" htmlFor="fullname">
                  Full Name
                </label>
                <div className={`relative ${isFullNameFocused ? 'scale-[1.01] transition-transform' : ''}`}>
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#737686]">person</span>
                  <input
                  className="w-full bg-white/50 border-[#c3c6d7] rounded-xl py-3 pl-10 pr-4 font-['Inter'] text-[14px] focus:border-[#004ac6] transition-all duration-200"
                  id="fullname"
                  placeholder="Enter your name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  onFocus={() => setIsFullNameFocused(true)}
                  onBlur={() => setIsFullNameFocused(false)}
                  />
                </div>
              </div>

              {/* Email Field */}
              <div className="space-y-1">
                <label className="font-['Inter'] text-[12px] font-semibold tracking-[0.02em] text-[#434655] ml-1" htmlFor="email">
                  Email Address
                </label>
                <div className={`relative ${isEmailFocused ? 'scale-[1.01] transition-transform' : ''}`}>
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#737686]">mail</span>
                  <input 
                    className="w-full bg-white/50 border-[#c3c6d7] rounded-xl py-3 pl-10 pr-4 font-['Inter'] text-[14px] focus:border-[#004ac6] transition-all duration-200" 
                    id="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@safety.com" 
                    type="email"
                    onFocus={() => setIsEmailFocused(true)}
                    onBlur={() => setIsEmailFocused(false)}
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-1">
                <label className="font-['Inter'] text-[12px] font-semibold tracking-[0.02em] text-[#434655] ml-1" htmlFor="password">
                  Password
                </label>
                <div className={`relative ${isPasswordFocused ? 'scale-[1.01] transition-transform' : ''}`}>
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#737686]">lock</span>
                  <input 
                    className="w-full bg-white/50 border-[#c3c6d7] rounded-xl py-3 pl-10 pr-12 font-['Inter'] text-[14px] focus:border-[#004ac6] transition-all duration-200" 
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••" 
                    type={showPassword ? "text" : "password"}
                    onFocus={() => setIsPasswordFocused(true)}
                    onBlur={() => setIsPasswordFocused(false)}
                  />
                  <button 
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#737686] hover:text-[#004ac6] transition-colors" 
                    type="button"
                    onClick={togglePasswordVisibility}
                  >
                    <span className="material-symbols-outlined">
                      {showPassword ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Primary Action */}
              <button 
                className="w-full bg-[#004ac6] text-[#ffffff] font-['Inter'] text-[12px] font-semibold h-12 rounded-xl shadow-md hover:bg-[#2563eb] hover:shadow-lg spring-animate transition-all flex items-center justify-center gap-2 mt-4" 
                type="submit"
              >
                Create Account
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>

              {/* Divider */}
              <div className="flex items-center gap-4 py-2">
                <div className="h-[1px] flex-1 bg-[#c3c6d7]"></div>
                <span className="text-[10px] font-bold text-[#737686] uppercase tracking-wider">or</span>
                <div className="h-[1px] flex-1 bg-[#c3c6d7]"></div>
              </div>

              {/* Social Auth */}
              <button 
                className="w-full bg-white text-[#191c1e] font-['Inter'] text-[12px] font-semibold h-12 rounded-xl border border-[#c3c6d7] shadow-sm hover:bg-[#f2f4f6] spring-animate transition-all flex items-center justify-center gap-3" 
                type="button"
              >
                <div className="w-5 h-5 flex items-center justify-center">
                  <svg className="w-full h-full" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"></path>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"></path>
                  </svg>
                </div>
                Sign up with Google
              </button>
            </form>
          </div>

          {/* Footer Link */}
          <p className="text-center font-['Inter'] text-[14px] text-[#434655]">
            Already have an account? 
            <a className="text-[#004ac6] font-semibold hover:underline decoration-2 underline-offset-4 ml-1" href="#">Login</a>
          </p>
        </main>
        
        {/* Background Decorative Elements */}
        <div className="fixed bottom-0 left-0 w-full h-1/3 bg-gradient-to-t from-white/80 to-transparent -z-1 pointer-events-none"></div>
      </div>
    </>
  );
};

export default SignUpPage;