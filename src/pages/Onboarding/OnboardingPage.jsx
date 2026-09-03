import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../context/store'

const SLIDES = [
  {
    icon: 'verified_user',
    iconColor: '#10B981',
    title: 'Navigate with Confidence',
    description: 'Find routes prioritized by safety, lighting, and community verification in real-time across West Bengal.',
    visual: (
      <div className="w-full h-full flex items-center justify-center">
        <div className="relative">
          <div className="w-32 h-32 rounded-full bg-[#10B981]/10 flex items-center justify-center">
            <div className="w-20 h-20 rounded-full bg-[#10B981]/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-[#10B981] text-[48px] icon-filled">verified_user</span>
            </div>
          </div>
          <div className="absolute -top-2 -right-2 bg-[#10B981] text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-lg animate-bounce">
            <span className="material-symbols-outlined text-[14px] icon-filled">verified_user</span>
            Safest Path
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: 'psychology',
    iconColor: '#004ac6',
    title: 'AI-Powered Safety',
    description: 'Our algorithm synthesizes local data to predict and avoid potential risks before you reach them.',
    visual: (
      <div className="w-full h-full grid grid-cols-2 gap-3 p-4">
        {[['local_hospital','#EF4444','Hospital'], ['local_police','#004ac6','Police'], ['lightbulb','#F59E0B','Lighting'], ['psychology','#10B981','AI Safety']].map(([icon,color,label]) => (
          <div key={label} className="glass-card rounded-2xl p-3 flex flex-col items-center gap-2">
            <span className="material-symbols-outlined icon-filled" style={{ color, fontSize: 28 }}>{icon}</span>
            <span className="text-[10px] font-bold text-[#434655] uppercase tracking-wider">{label}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: 'groups',
    iconColor: '#004ac6',
    title: 'Community First',
    description: 'Join thousands of citizens reporting hazards and keeping their neighborhoods safe for everyone.',
    visual: (
      <div className="w-full h-full flex flex-col justify-center gap-3 p-4">
        {[['report_problem','#EF4444','Harassment Alert','2m ago'], ['water_drop','#3B82F6','Waterlogging Reported','5m ago'], ['construction','#F59E0B','Road Work Ahead','12m ago']].map(([icon,color,text,time]) => (
          <div key={text} className="flex items-center gap-3 p-3 rounded-xl bg-white/60 border border-white/30 animate-fade-in">
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: color + '18' }}>
              <span className="material-symbols-outlined text-[18px]" style={{ color }}>{icon}</span>
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-[#191c1e]">{text}</p>
            </div>
            <span className="text-[10px] font-bold text-[#737686]">{time}</span>
          </div>
        ))}
      </div>
    ),
  },
]

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const navigate = useNavigate()
  const { setHasOnboarded } = useAppStore()

  const handleNext = () => {
    if (step < SLIDES.length - 1) setStep(step + 1)
    else { setHasOnboarded(true); navigate('/login') }
  }

  const handleSkip = () => { setHasOnboarded(true); navigate('/login') }

  const slide = SLIDES[step]

  return (
    <div className="fixed inset-0 bg-[#f7f9fb] flex flex-col overflow-hidden">
      <div className="absolute inset-0 map-mesh opacity-20" />
      <div className="absolute inset-0 bg-gradient-to-tr from-[#004ac6]/5 via-transparent to-[#10B981]/5" />

      <div className="relative z-10 flex flex-col h-full max-w-md mx-auto w-full">
        {/* Top nav */}
        <div className="flex justify-between items-center px-6 pt-10 pb-4">
          <div className="flex items-center gap-2">
            <img src="/logo.png" style={{ width: '24px', height: '24px', objectFit: 'contain', mixBlendMode: 'multiply' }} alt="Logo" />
            <span className="text-lg font-bold text-[#004ac6] tracking-tight">Safety Guardian</span>
          </div>
          <button onClick={handleSkip} className="text-xs font-bold text-[#737686] uppercase tracking-widest hover:text-[#004ac6] transition-colors">
            Skip
          </button>
        </div>

        {/* Visual */}
        <div className="flex-1 px-6">
          <div className="glass-card rounded-[2rem] overflow-hidden shadow-xl h-64 mb-8">
            {slide.visual}
          </div>
          <div className="text-center space-y-3">
            <h1 className="text-2xl font-bold text-[#191c1e] tracking-tight">{slide.title}</h1>
            <p className="text-[#505f76] text-sm leading-relaxed px-4">{slide.description}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-12 space-y-5">
          {/* Dots */}
          <div className="flex justify-center gap-2">
            {SLIDES.map((_, i) => (
              <button key={i} onClick={() => setStep(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-6 bg-[#004ac6]' : 'w-1.5 bg-[#c3c6d7]'}`}
              />
            ))}
          </div>
          {/* Action */}
          <button
            onClick={handleNext}
            className={`w-full h-14 rounded-xl font-semibold text-white shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-all duration-200 ${
              step === SLIDES.length - 1 ? 'bg-[#10B981] shadow-green-300/40' : 'bg-[#004ac6] shadow-blue-300/40'
            }`}
          >
            {step === SLIDES.length - 1 ? 'Get Started' : 'Next'}
            <span className="material-symbols-outlined text-[20px]">
              {step === SLIDES.length - 1 ? 'rocket_launch' : 'arrow_forward'}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
