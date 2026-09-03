/**
 * badgeService.js — Badge & Achievement System Engine
 *
 * Manages user badges, achievements, reputation points (SR), and unlock milestones.
 */

import { calculateProfileCompletion } from './medicalService'

export const BADGE_TIERS = [
  { minPoints: 0,   maxPoints: 99,   name: 'Novice Citizen',  color: '#64748B', icon: 'shield' },
  { minPoints: 100, maxPoints: 249,  name: 'Active Guardian', color: '#10B981', icon: 'verified_user' },
  { minPoints: 250, maxPoints: 499,  name: 'Safety Champion', color: '#3B82F6', icon: 'military_tech' },
  { minPoints: 500, maxPoints: 999,  name: 'Community Hero',  color: '#8B5CF6', icon: 'workspace_premium' },
  { minPoints: 1000, maxPoints: 9999, name: 'Guardian Legend', color: '#F59E0B', icon: 'stars' },
]

export const ALL_BADGES = [
  {
    id: 'medical_ready',
    title: 'Medical Preparedness',
    category: 'Medical',
    icon: 'health_and_safety',
    color: '#10B981',
    bg: '#ECFDF5',
    description: 'Complete your full Medical Profile with blood group, conditions & emergency contacts.',
    howToEarn: 'Fill out 100% of your Medical Profile survey.',
    points: 100,
    checkUnlocked: ({ medicalProfile }) => {
      return calculateProfileCompletion(medicalProfile) >= 85
    },
    getProgress: ({ medicalProfile }) => {
      return calculateProfileCompletion(medicalProfile)
    },
    targetText: '100% profile complete',
  },
  {
    id: 'first_report',
    title: 'First Responder',
    category: 'Community',
    icon: 'flag',
    color: '#F59E0B',
    bg: '#FFFBEB',
    description: 'Report your first road hazard, flood, or safety incident to assist fellow travelers.',
    howToEarn: 'Submit at least 1 verified hazard report.',
    points: 50,
    checkUnlocked: ({ reportsCount }) => (reportsCount || 0) >= 1,
    getProgress: ({ reportsCount }) => Math.min(100, ((reportsCount || 0) / 1) * 100),
    targetText: '1 hazard reported',
  },
  {
    id: 'guardian_angel',
    title: 'Guardian Angel',
    category: 'Community',
    icon: 'shield_with_heart',
    color: '#EF4444',
    bg: '#FEF2F2',
    description: 'Provide persistent community alerts by reporting 5 or more road hazards.',
    howToEarn: 'Submit 5 verified hazard reports.',
    points: 150,
    checkUnlocked: ({ reportsCount }) => (reportsCount || 0) >= 5,
    getProgress: ({ reportsCount }) => Math.min(100, ((reportsCount || 0) / 5) * 100),
    targetText: '5 hazard reports',
  },
  {
    id: 'city_scout',
    title: 'City Scout',
    category: 'Navigation',
    icon: 'explore',
    color: '#3B82F6',
    bg: '#EFF6FF',
    description: 'Navigate safely using Safest Route mode on 3 journeys.',
    howToEarn: 'Complete 3 journeys with turn-by-turn safe navigation.',
    points: 75,
    checkUnlocked: ({ journeysCount }) => (journeysCount || 0) >= 3,
    getProgress: ({ journeysCount }) => Math.min(100, ((journeysCount || 0) / 3) * 100),
    targetText: '3 safe journeys',
  },
  {
    id: 'community_shield',
    title: 'Community Shield',
    category: 'Safety',
    icon: 'group',
    color: '#8B5CF6',
    bg: '#F5F3FF',
    description: 'Enable Live Friend Tracking to keep your trusted circle informed.',
    howToEarn: 'Turn on Live Friend Tracking in Safety Settings.',
    points: 50,
    checkUnlocked: ({ liveTrackingEnabled }) => !!liveTrackingEnabled,
    getProgress: ({ liveTrackingEnabled }) => (liveTrackingEnabled ? 100 : 0),
    targetText: 'Live tracking enabled',
  },
  {
    id: 'emergency_shield',
    title: 'Lifeline Secured',
    category: 'Safety',
    icon: 'contact_phone',
    color: '#0284C7',
    bg: '#F0F9FF',
    description: 'Add at least 2 emergency contacts to your safety circle.',
    howToEarn: 'Save 2 or more emergency contacts.',
    points: 50,
    checkUnlocked: ({ contactsCount }) => (contactsCount || 0) >= 2,
    getProgress: ({ contactsCount }) => Math.min(100, ((contactsCount || 0) / 2) * 100),
    targetText: '2 emergency contacts',
  },
  {
    id: 'safety_pioneer',
    title: 'Safety Pioneer',
    category: 'Mastery',
    icon: 'stars',
    color: '#D97706',
    bg: '#FFFBEB',
    description: 'Reach 350+ Safety Reputation points through community contributions.',
    howToEarn: 'Earn 350 total Safety Reputation points.',
    points: 200,
    checkUnlocked: ({ totalPoints }) => (totalPoints || 0) >= 350,
    getProgress: ({ totalPoints }) => Math.min(100, ((totalPoints || 0) / 350) * 100),
    targetText: '350 SR points',
  },
]

/**
 * Computes user's badge progression and tier
 */
export function computeUserBadges(userState) {
  let earnedPoints = 0
  const badgesWithStatus = ALL_BADGES.map(b => {
    const isUnlocked = b.checkUnlocked(userState)
    const progress = b.getProgress(userState)
    if (isUnlocked) earnedPoints += b.points

    return {
      ...b,
      unlocked: isUnlocked,
      progress,
    }
  })

  // Determine current tier
  const currentTier = BADGE_TIERS.find(t => earnedPoints >= t.minPoints && earnedPoints <= t.maxPoints) || BADGE_TIERS[0]
  const nextTier = BADGE_TIERS.find(t => t.minPoints > earnedPoints) || null
  const progressToNextTier = nextTier
    ? Math.round(((earnedPoints - currentTier.minPoints) / (nextTier.minPoints - currentTier.minPoints)) * 100)
    : 100

  return {
    badges: badgesWithStatus,
    earnedCount: badgesWithStatus.filter(b => b.unlocked).length,
    totalCount: badgesWithStatus.length,
    totalPoints: earnedPoints,
    currentTier,
    nextTier,
    progressToNextTier,
  }
}
