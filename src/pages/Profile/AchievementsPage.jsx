/**
 * AchievementsPage.jsx — Safety Reputation & Badge Collection
 *
 * Requirements:
 *  - Separate dedicated badge page
 *  - Earned vs Locked badges collection
 *  - Progress toward next badge
 *  - Reputation-based badge progression (Safety Reputation - SR)
 *  - Smooth unlock animations & clear criteria descriptions
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../context/store'
import { auth } from '../../firebase/firebase'
import { loadMedicalProfile } from '../../services/medicalService'
import { computeUserBadges, BADGE_TIERS } from '../../services/badgeService'

export default function AchievementsPage() {
  const navigate = useNavigate()
  const { reports, prefs } = useAppStore()
  const [medicalProfile, setMedicalProfile] = useState(null)
  const [selectedBadge, setSelectedBadge] = useState(null)

  useEffect(() => {
    async function load() {
      const uid = auth?.currentUser?.uid
      const prof = await loadMedicalProfile(uid)
      setMedicalProfile(prof)
    }
    load()
  }, [])

  const userState = {
    medicalProfile,
    reportsCount: reports?.length || 0,
    journeysCount: 3, // demo safe journeys completed
    liveTrackingEnabled: prefs?.liveFriendTracking || false,
    contactsCount: medicalProfile?.emergencyContacts?.length || 0,
    totalPoints: 0,
  }

  const badgeData = computeUserBadges(userState)

  return (
    <div className="relative w-full h-full bg-[#F8FAFC] flex flex-col overflow-hidden animate-fade-in">
      {/* ── Top Header ── */}
      <div className="bg-white border-b border-[#E2E8F0] px-4 pt-11 pb-4 shadow-sm flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-2xl bg-[#F1F5F9] hover:bg-[#E2E8F0] active:scale-95 flex items-center justify-center transition-colors"
            >
              <span className="material-symbols-outlined text-[#334155]" style={{ fontSize: 22 }}>arrow_back</span>
            </button>
            <div>
              <h1 className="text-base font-black text-[#0F172A] leading-tight">Badges &amp; Achievements</h1>
              <p className="text-xs text-[#64748B]">Safety Reputation Milestones</p>
            </div>
          </div>

          {/* Current Tier Badge */}
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border shadow-sm"
            style={{
              borderColor: badgeData.currentTier.color + '40',
              backgroundColor: badgeData.currentTier.color + '10',
            }}
          >
            <span
              className="material-symbols-outlined icon-filled"
              style={{ fontSize: 16, color: badgeData.currentTier.color }}
            >
              {badgeData.currentTier.icon}
            </span>
            <span
              className="text-xs font-black"
              style={{ color: badgeData.currentTier.color }}
            >
              {badgeData.currentTier.name}
            </span>
          </div>
        </div>

        {/* Reputation Score & Tier Progression */}
        <div className="bg-gradient-to-r from-[#0F172A] to-[#1E293B] rounded-3xl p-4 text-white shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-[#94A3B8] uppercase tracking-wider">Safety Reputation (SR)</p>
              <p className="text-2xl font-black text-[#38BDF8] mt-0.5">{badgeData.totalPoints} <span className="text-xs text-white/70 font-bold">Points</span></p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black text-[#94A3B8] uppercase tracking-wider">Unlocked</p>
              <p className="text-sm font-black text-white">{badgeData.earnedCount} / {badgeData.totalCount} Badges</p>
            </div>
          </div>

          {badgeData.nextTier && (
            <div className="space-y-1 pt-1 border-t border-white/10">
              <div className="flex justify-between text-[11px] font-bold text-[#94A3B8]">
                <span>Progress to {badgeData.nextTier.name}</span>
                <span>{badgeData.nextTier.minPoints - badgeData.totalPoints} pts needed</span>
              </div>
              <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#38BDF8] rounded-full transition-all duration-500"
                  style={{ width: `${badgeData.progressToNextTier}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Badges Grid Collection ── */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4 pb-20">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black text-[#334155] uppercase tracking-wider">
            All Safety Badges ({badgeData.earnedCount} Earned)
          </h2>
          <span className="text-[11px] text-[#64748B] font-bold">Tap a badge for details</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {badgeData.badges.map(b => (
            <button
              key={b.id}
              onClick={() => setSelectedBadge(b)}
              className={`p-4 rounded-3xl border text-left transition-all active:scale-95 flex flex-col justify-between relative overflow-hidden ${
                b.unlocked
                  ? 'bg-white border-[#CBD5E1] shadow-sm hover:shadow-md'
                  : 'bg-[#F1F5F9]/70 border-[#E2E8F0] opacity-75'
              }`}
            >
              {/* Unlocked / Locked Top Status */}
              <div className="flex items-center justify-between mb-3 w-full">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm transition-transform"
                  style={{
                    backgroundColor: b.unlocked ? b.bg : '#E2E8F0',
                    color: b.unlocked ? b.color : '#94A3B8',
                  }}
                >
                  <span
                    className={`material-symbols-outlined ${b.unlocked ? 'icon-filled' : ''}`}
                    style={{ fontSize: 24 }}
                  >
                    {b.icon}
                  </span>
                </div>

                {b.unlocked ? (
                  <span className="px-2 py-0.5 rounded-full bg-[#ECFDF5] text-[#059669] text-[10px] font-black border border-[#A7F3D0]">
                    ✓ Earned
                  </span>
                ) : (
                  <span className="material-symbols-outlined text-[#94A3B8]" style={{ fontSize: 18 }}>
                    lock
                  </span>
                )}
              </div>

              <div>
                <h3 className={`text-xs font-black leading-tight ${b.unlocked ? 'text-[#0F172A]' : 'text-[#64748B]'}`}>
                  {b.title}
                </h3>
                <p className="text-[10px] text-[#64748B] font-medium mt-1 line-clamp-2">
                  {b.description}
                </p>
              </div>

              {/* Progress Indicator */}
              <div className="mt-3 pt-2 border-t border-[#F1F5F9] w-full">
                <div className="flex items-center justify-between text-[10px] font-bold text-[#64748B] mb-1">
                  <span>+{b.points} SR</span>
                  <span>{b.unlocked ? '100%' : `${Math.round(b.progress)}%`}</span>
                </div>
                <div className="w-full h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${b.unlocked ? 100 : b.progress}%`,
                      backgroundColor: b.unlocked ? b.color : '#94A3B8',
                    }}
                  />
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Badge Detail Modal ── */}
      {selectedBadge && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
          onClick={() => setSelectedBadge(null)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl border border-[#E2E8F0] space-y-4 animate-scale-up text-center relative"
            onClick={e => e.stopPropagation()}
          >
            <div
              className="w-20 h-20 rounded-3xl mx-auto flex items-center justify-center shadow-lg"
              style={{
                backgroundColor: selectedBadge.unlocked ? selectedBadge.bg : '#F1F5F9',
                color: selectedBadge.unlocked ? selectedBadge.color : '#94A3B8',
              }}
            >
              <span className={`material-symbols-outlined ${selectedBadge.unlocked ? 'icon-filled' : ''}`} style={{ fontSize: 40 }}>
                {selectedBadge.icon}
              </span>
            </div>

            <div>
              <div className="inline-block px-3 py-1 rounded-full text-xs font-black mb-1" style={{
                backgroundColor: selectedBadge.unlocked ? '#ECFDF5' : '#F1F5F9',
                color: selectedBadge.unlocked ? '#059669' : '#64748B',
              }}>
                {selectedBadge.unlocked ? '🏆 Badge Unlocked' : '🔒 Locked Badge'}
              </div>
              <h3 className="text-base font-black text-[#0F172A]">{selectedBadge.title}</h3>
              <p className="text-xs text-[#64748B] mt-1">{selectedBadge.description}</p>
            </div>

            <div className="p-3 bg-[#F8FAFC] rounded-2xl border border-[#E2E8F0] text-left space-y-1.5">
              <p className="text-[10px] font-black text-[#64748B] uppercase tracking-wider">How to unlock:</p>
              <p className="text-xs font-bold text-[#1E293B]">{selectedBadge.howToEarn}</p>
              <div className="pt-2 flex items-center justify-between text-xs font-bold text-[#64748B]">
                <span>Reward Value</span>
                <span className="text-[#059669] font-black">+{selectedBadge.points} Safety Reputation Points</span>
              </div>
            </div>

            <button
              onClick={() => setSelectedBadge(null)}
              className="w-full py-3 rounded-2xl bg-[#0F172A] text-white text-xs font-black active:scale-95 transition-transform"
            >
              Got it!
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
