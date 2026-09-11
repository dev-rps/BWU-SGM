import { useNavigate } from 'react-router-dom';

export default function TermsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col items-center py-8 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-10">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <span className="material-symbols-outlined icon-filled text-2xl">gavel</span>
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Safety Guardian</h1>
              <p className="text-xs text-slate-500 font-semibold">Terms of Service</p>
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
            <h2 className="text-base font-bold text-slate-900 mb-2">1. Acceptance of Terms</h2>
            <p>
              By accessing or using Safety Guardian at <a href="https://bwu-sgm.vercel.app" className="text-blue-600 underline">https://bwu-sgm.vercel.app</a>, you agree to be bound by these Terms of Service. If you do not agree with any part of these terms, you may not use our services.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900 mb-2">2. Emergency Disclaimer</h2>
            <p className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-amber-900 text-xs leading-relaxed">
              <strong>Important Notice:</strong> Safety Guardian is an assistive routing and personal safety tool. While we strive to provide real-time hazard alerts and accurate safety scoring, the service is not a substitute for official emergency response services (such as police, fire, or ambulance). In an immediate life-threatening emergency, always contact local emergency dispatch (e.g., 112 / 100).
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900 mb-2">3. User Conduct & Community Reporting</h2>
            <p>
              When reporting hazards, incidents, or waterlogging, you agree to provide truthful and accurate information. Submitting fraudulent reports, harassing other users, or attempting to compromise platform integrity is strictly prohibited.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900 mb-2">4. Contact Information</h2>
            <p>
              For legal inquiries or service questions, please contact us at: <a href="mailto:support@safetyguardian.app" className="text-blue-600 underline">support@safetyguardian.app</a>.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
          <span>&copy; {new Date().getFullYear()} Safety Guardian. All rights reserved.</span>
          <div className="flex gap-4">
            <a href="https://bwu-sgm.vercel.app" className="hover:text-slate-600 transition-colors">Home</a>
            <a href="/privacy" className="hover:text-slate-600 transition-colors">Privacy Policy</a>
          </div>
        </div>

      </div>
    </div>
  );
}
