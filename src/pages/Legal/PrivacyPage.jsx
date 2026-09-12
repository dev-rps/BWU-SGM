import { useNavigate } from 'react-router-dom';

export default function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col items-center py-8 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-10">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <span className="material-symbols-outlined icon-filled text-2xl">shield</span>
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Safety Guardian</h1>
              <p className="text-xs text-slate-500 font-semibold">Privacy Policy</p>
            </div>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Back
          </button>
        </div>

        <div className="text-xs text-slate-400 font-semibold mb-6">
          Last Updated: September 11, 2026
        </div>

        {/* Content */}
        <div className="space-y-6 text-sm leading-relaxed text-slate-600">
          <section>
            <h2 className="text-base font-bold text-slate-900 mb-2">1. Introduction</h2>
            <p>
              Welcome to <strong>Safety Guardian</strong> ("we", "our", or "us"), available at{' '}
              <a href="https://safetyguardian.xyz" className="text-blue-600 underline hover:text-blue-700">
                https://safetyguardian.xyz
              </a>.
              Your privacy and personal safety are fundamental to our mission. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our web application and mobile services.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900 mb-2">2. Information We Collect</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Account & Authentication Information:</strong> When you sign in with Google or email, we receive your basic profile data (name, email address, profile photo URL) provided by Google OAuth or Supabase Auth.
              </li>
              <li>
                <strong>Real-Time Geolocation Data:</strong> With your explicit permission, we access your device’s GPS coordinates to display your live position on maps, calculate safe routes, provide hazard proximity warnings, and share emergency SOS locations with your designated contacts.
              </li>
              <li>
                <strong>Crowdsourced Hazard Reports:</strong> Reports you choose to submit (such as road hazards, lighting issues, flooding, or safety incidents) including location pins, descriptions, and optional photos.
              </li>
              <li>
                <strong>Emergency Contacts:</strong> Names and phone numbers of emergency contacts you voluntarily designate for SOS alerts.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900 mb-2">3. How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>To provide AI and machine learning-powered safe routing recommendations.</li>
              <li>To alert you to nearby hazards, crime blackspots, waterlogging, or weather risks.</li>
              <li>To trigger SOS emergency broadcasts to your trusted contacts upon your command or shake gesture.</li>
              <li>To authenticate your identity securely and maintain your user preferences and achievements.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900 mb-2">4. Data Sharing & Third-Party Services</h2>
            <p className="mb-2">
              We do <strong>not</strong> sell, rent, or monetize your personal or location data. We interact only with trusted infrastructure providers necessary for app functionality:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Google OAuth:</strong> For secure single sign-on authentication.</li>
              <li><strong>Supabase:</strong> For database storage, session encryption, and authentication state.</li>
              <li><strong>TomTom & Google Maps APIs:</strong> For live navigation tiles, geocoding, and traffic data.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900 mb-2">5. Data Retention & Deletion</h2>
            <p>
              You may review, update, or delete your profile information at any time from the <strong>My Account</strong> section in the app. If you wish to delete your account and all associated data, you may submit a request or contact us directly.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900 mb-2">6. Contact Us</h2>
            <p>
              If you have any questions, concerns, or requests regarding this Privacy Policy or your data protection, please contact us at:{' '}
              <a href="mailto:support@safetyguardian.app" className="text-blue-600 underline font-medium">
                support@safetyguardian.app
              </a>.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
          <span>&copy; {new Date().getFullYear()} Safety Guardian. All rights reserved.</span>
          <div className="flex gap-4">
            <a href="https://safetyguardian.xyz" className="hover:text-slate-600 transition-colors">Home</a>
            <a href="/terms" className="hover:text-slate-600 transition-colors">Terms of Service</a>
          </div>
        </div>

      </div>
    </div>
  );
}
