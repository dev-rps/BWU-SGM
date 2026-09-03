/**
 * ProfilePage.jsx — Production-ready profile with:
 *  - Clickable avatar with photo upload (saved to Firestore as base64)
 *  - Inline username editing (saved to Firestore)
 *  - Working phone number editing (inline modal)
 *  - Verification badge next to name (✓ Verified · Citizen)
 *  - Stats: Reports Submitted, Reports Verified, Community Impact, Member Since
 *  - 3-dot context menu: Home, Journey, Reports, Weather, Logout
 *  - Emergency Contacts from Firestore with "Import from Phone" (Contact Picker API)
 *  - Camera / Location / Contacts permission requests
 *  - Safety Preferences toggles
 *  - Medical Profile Survey & Badge Achievements Integration
 *  - Zero backend logic changes — only UI enhancements
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../context/store'
import { auth, db } from '../../firebase/firebase'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { loadContacts, saveContacts, generateId } from '../../services/contactsService'

import MedicalProfileSurvey from './MedicalProfileSurvey'
import { loadMedicalProfile, calculateProfileCompletion } from '../../services/medicalService'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  '#4A90D9','#E8704A','#7BC67E','#9B59B6',
  '#E74C3C','#F39C12','#1ABC9C','#2980B9',
]
function getColor(name) {
  let h = 0
  for (const c of (name || '?')) h = c.charCodeAt(0) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function initials(name) {
  if (!name) return '?'
  const p = name.trim().split(' ')
  return (p[0][0] + (p[1]?.[0] || '')).toUpperCase()
}

// ─── Toggle ───────────────────────────────────────────────────────────────────
function Toggle({ on, onChange }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="w-12 h-6 rounded-full transition-all duration-200 relative flex-shrink-0"
      style={{ background: on ? '#1B5E20' : '#c3c6d7' }}
    >
      <div
        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200"
        style={{ left: on ? '26px' : '2px' }}
      />
    </button>
  )
}

// ─── Contact Form Modal ───────────────────────────────────────────────────────
function ContactModal({ contact, onSave, onClose }) {
  const [name, setName]                 = useState(contact?.name         || '')
  const [phone, setPhone]               = useState(contact?.phone        || '')
  const [relationship, setRelationship] = useState(contact?.relationship || '')

  const cleanPhone = phone.replace(/[\s\-()]/g, '')
  const isValidPhone = /^(?:\+91|0)?[6-9]\d{9}$/.test(cleanPhone)
  const valid = name.trim().length > 0 && isValidPhone

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-t-3xl p-6 pb-10 animate-slide-up"
        onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full bg-[#c3c6d7] mx-auto mb-5" />
        <h3 className="text-base font-black text-[#191c1e] mb-4">
          {contact ? 'Edit Contact' : 'Add Emergency Contact'}
        </h3>
        <div className="space-y-3">
          {[
            { label: 'Contact Name *', value: name,         set: setName,         ph: 'e.g. John Doe',      type: 'text' },
            { label: 'Phone Number *', value: phone,        set: setPhone,        ph: '+91 XXXXX XXXXX',    type: 'tel'  },
            { label: 'Relationship',   value: relationship, set: setRelationship, ph: 'e.g. Father, Friend', type: 'text' },
          ].map(f => (
            <div key={f.label}>
              <label className="block text-xs font-bold text-[#737686] mb-1 ml-1">{f.label}</label>
              <input type={f.type} value={f.value} onChange={e => f.set(e.target.value)}
                placeholder={f.ph}
                className={`w-full bg-[#f7f9fb] border rounded-xl px-4 py-3 text-sm text-[#191c1e] outline-none transition-colors ${f.type === 'tel' && f.value.length > 0 && !isValidPhone ? 'border-red-500 focus:border-red-500' : 'border-[#eceef0] focus:border-[#1B5E20]'}`} />
              {f.type === 'tel' && f.value.length > 0 && !isValidPhone && (
                <p className="text-[10px] text-red-500 mt-1 ml-1">Enter a valid 10-digit Indian mobile number</p>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose}
            className="flex-1 h-12 rounded-xl border border-[#eceef0] text-[#737686] font-semibold text-sm">
            Cancel
          </button>
          <button onClick={() => valid && onSave({ name: name.trim(), phone: phone.trim(), relationship: relationship.trim() })}
            disabled={!valid}
            className="flex-1 h-12 rounded-xl font-bold text-sm text-white disabled:opacity-40 active:scale-95 transition-all"
            style={{ background: '#1B5E20' }}>
            {contact ? 'Save Changes' : 'Add Contact'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────
function DeleteModal({ contactName, onConfirm, onClose }) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center px-6"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-3xl p-6 text-center" onClick={e => e.stopPropagation()}>
        <div className="w-14 h-14 rounded-full bg-[#FEF2F2] flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined icon-filled text-[#EF4444] text-[28px]">delete</span>
        </div>
        <h3 className="text-base font-black text-[#191c1e] mb-1">Delete Contact?</h3>
        <p className="text-sm text-[#737686] mb-5">Remove <strong>{contactName}</strong> from your emergency contacts?</p>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-[#eceef0] text-[#737686] font-semibold text-sm">Cancel</button>
          <button onClick={onConfirm} className="flex-1 h-11 rounded-xl font-bold text-sm text-white bg-[#EF4444]">Delete</button>
        </div>
      </div>
    </div>
  )
}

// -- Edit Field Modal --
function EditFieldModal({ title, value, type, placeholder, onSave, onClose }) {
  const [val, setVal] = useState(value || "")

  let isValid = val.trim().length > 0
  if (type === "tel") {
    const cleanPhone = val.replace(/[\s\-()]/g, "")
    isValid = /^(?:\+91|0)?[6-9]\d{9}$/.test(cleanPhone)
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-t-3xl p-6 pb-10"
        onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full bg-[#c3c6d7] mx-auto mb-5" />
        <h3 className="text-base font-black text-[#191c1e] mb-4">{title}</h3>
        <input type={type || "text"} value={val} onChange={e => setVal(e.target.value)} placeholder={placeholder}
          className="w-full bg-[#f7f9fb] border border-[#eceef0] rounded-xl px-4 py-3 text-sm text-[#191c1e] outline-none mb-1" />
        {type === "tel" && val.length > 0 && !isValid && (
          <p className="text-[10px] text-red-500 mb-3 ml-1">Enter a valid 10-digit Indian mobile number</p>
        )}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 h-12 rounded-xl border border-[#eceef0] text-[#737686] font-semibold text-sm">Cancel</button>
          <button onClick={() => isValid && onSave(val.trim())} disabled={!isValid}
            className="flex-1 h-12 rounded-xl font-bold text-sm text-white disabled:opacity-40 active:scale-95 transition-all"
            style={{ background: "#1B5E20" }}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const navigate = useNavigate()
  const {
    user, setUser,
    reports, safetyScore,
    emergencyContacts, setEmergencyContacts,
    setIsLoggedIn, setHasPermissions,
    prefs, setPrefs,
  } = useAppStore()

  // UI state
  const [showMenu,      setShowMenu]      = useState(false)
  const [showAddModal,  setShowAddModal]  = useState(false)
  const [editContact,   setEditContact]   = useState(null)
  const [deleteTarget,  setDeleteTarget]  = useState(null)
  const [contactsLoading, setContactsLoading] = useState(false)
  const [contactsError,   setContactsError]   = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [editField,     setEditField]     = useState(null) // { key: 'name'|'phone', value: string }
  const [importingContacts, setImportingContacts] = useState(false)

  // Medical state
  const [showMedicalSurvey, setShowMedicalSurvey] = useState(false)
  const [medicalProfile, setMedicalProfile] = useState(null)

  // Preferences are now in global store

  const fileInputRef = useRef(null)
  const menuRef      = useRef(null)

  // ── Load contacts + user Firestore profile on mount ──────────────────────
  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) return

    // Load Firestore user profile (name override, phone, avatar)
    getDoc(doc(db, 'users', uid)).then(snap => {
      if (!snap.exists()) return
      const data = snap.data()
      if (data.displayName || data.phone || data.avatarDataUrl) {
        setUser(prev => ({
          ...prev,
          name:   data.displayName || prev.name,
          phone:  data.phone       || prev.phone,
          avatar: data.avatarDataUrl || prev.avatar,
        }))
      }
    }).catch(() => {})

    // Load contacts if not already loaded
    if (emergencyContacts.length === 0) {
      setContactsLoading(true)
      loadContacts(uid)
        .then(c => { setEmergencyContacts(c); setContactsLoading(false) })
        .catch(() => { setContactsError(true); setContactsLoading(false) })
    }
  }, [])

  // ── Load Medical Profile ───────────────────────────────────────────────────
  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) return
    loadMedicalProfile(uid).then(setMedicalProfile).catch(() => {})
  }, [showMedicalSurvey])

  // Close menu on outside click
  // IMPORTANT: use 'pointerup' not 'mousedown' — mousedown fires BEFORE onClick
  // which caused the menu to close before navigate() could run.
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('pointerup', handler)
    return () => document.removeEventListener('pointerup', handler)
  }, [])

  // ── Photo upload ──────────────────────────────────────────────────────────
  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const uid = auth.currentUser?.uid
    if (!uid) return
    setUploadingPhoto(true)
    const reader = new FileReader()
    reader.onload = async (evt) => {
      const dataUrl = evt.target.result
      try {
        const ref = doc(db, 'users', uid)
        const snap = await getDoc(ref)
        if (snap.exists()) {
          await updateDoc(ref, { avatarDataUrl: dataUrl })
        } else {
          await setDoc(ref, { avatarDataUrl: dataUrl }, { merge: true })
        }
        setUser(prev => ({ ...prev, avatar: dataUrl }))
      } catch (err) {
        console.error('Photo upload error:', err)
        alert('Failed to save photo. Try again.')
      } finally {
        setUploadingPhoto(false)
      }
    }
    reader.readAsDataURL(file)
  }

  // ── Save name ─────────────────────────────────────────────────────────────
  const handleSaveName = async (newName) => {
    const uid = auth.currentUser?.uid
    if (!uid) return
    try {
      const ref  = doc(db, 'users', uid)
      const snap = await getDoc(ref)
      snap.exists()
        ? await updateDoc(ref, { displayName: newName })
        : await setDoc(ref, { displayName: newName }, { merge: true })
      setUser(prev => ({ ...prev, name: newName }))
    } catch { alert('Failed to save name.') }
    setEditField(null)
  }

  // ── Save phone ────────────────────────────────────────────────────────────
  const handleSavePhone = async (newPhone) => {
    const uid = auth.currentUser?.uid
    if (!uid) return
    try {
      const ref  = doc(db, 'users', uid)
      const snap = await getDoc(ref)
      snap.exists()
        ? await updateDoc(ref, { phone: newPhone })
        : await setDoc(ref, { phone: newPhone }, { merge: true })
      setUser(prev => ({ ...prev, phone: newPhone }))
    } catch { alert('Failed to save phone.') }
    setEditField(null)
  }

  // ── Persist contacts ──────────────────────────────────────────────────────
  const persist = async (updated) => {
    const uid = auth.currentUser?.uid
    if (!uid) return
    setSaving(true)
    try {
      await saveContacts(uid, updated)
      setEmergencyContacts(updated)
    } catch { alert('Failed to save. Try again.') }
    finally { setSaving(false) }
  }

  const handleAddContact    = async (data) => { await persist([...emergencyContacts, { id: generateId(), createdAt: new Date().toISOString(), ...data }]); setShowAddModal(false) }
  const handleEditContact   = async (data) => { await persist(emergencyContacts.map(c => c.id === editContact.id ? { ...c, ...data } : c)); setEditContact(null) }
  const handleDeleteContact = async ()     => { await persist(emergencyContacts.filter(c => c.id !== deleteTarget.id)); setDeleteTarget(null) }

  // ── Import contacts from phone (Contact Picker API) ───────────────────────
  const handleImportContacts = async () => {
    if (!('contacts' in navigator && 'ContactsManager' in window)) {
      alert('Contact import is not supported on this browser.\nPlease use Chrome on Android, or add contacts manually.')
      return
    }
    setImportingContacts(true)
    try {
      const results = await navigator.contacts.select(['name', 'tel'], { multiple: true })
      if (!results || results.length === 0) return
      const imported = results
        .filter(c => c.name?.[0] && c.tel?.[0])
        .map(c => ({
          id:           generateId(),
          name:         c.name[0],
          phone:        c.tel[0],
          relationship: '',
          createdAt:    new Date().toISOString(),
        }))
      if (imported.length === 0) { alert('No valid contacts selected.'); return }
      await persist([...emergencyContacts, ...imported])
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Import contacts error:', err)
    } finally { setImportingContacts(false) }
  }

  // ── Request permissions ───────────────────────────────────────────────────
  const requestPermissions = async () => {
    const results = {}
    // Location
    try {
      const loc = await navigator.permissions.query({ name: 'geolocation' })
      if (loc.state === 'prompt') {
        navigator.geolocation.getCurrentPosition(() => {}, () => {})
      }
      results.location = loc.state
    } catch { results.location = 'unsupported' }
    // Camera
    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: true })
      cam.getTracks().forEach(t => t.stop())
      results.camera = 'granted'
    } catch { results.camera = 'denied' }
    alert(
      `Permissions:\n📍 Location: ${results.location || 'N/A'}\n📷 Camera: ${results.camera || 'N/A'}\n\nContacts: Use the "Import from Contacts" button.`
    )
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    setIsLoggedIn(false)
    setHasPermissions(false)
    setEmergencyContacts([])
    navigate('/login')
  }

  // ── Stats derived ─────────────────────────────────────────────────────────
  const uid              = auth.currentUser?.uid
  const myReports        = reports.filter(r => r.uid === uid)
  const reportsSubmitted = myReports.length
  const reportsVerified  = myReports.filter(r => (r.upvotes?.length || 0) > 0).length
  const communityImpact  = myReports.reduce((sum, r) => sum + ((r.upvotes?.length || 0) - (r.downvotes?.length || 0)), 0)
  const memberSince      = user?.memberSince || '—'

  const STATS = [
    { icon: 'flag',           label: 'Submitted',  value: reportsSubmitted,  color: '#F59E0B' },
    { icon: 'verified',       label: 'Verified',   value: reportsVerified,   color: '#10B981' },
    { icon: 'volunteer_activism', label: 'Impact', value: `+${Math.max(0, communityImpact)}`, color: '#004ac6' },
    { icon: 'calendar_month', label: 'Since',      value: memberSince,       color: '#7C3AED' },
  ]

  // ── 3-dot menu items ──────────────────────────────────────────────────────
  const MENU_ITEMS = [
    { icon: 'home',       label: 'Home',        path: '/',        color: '#004ac6' },
    { icon: 'navigation', label: 'Journey',     path: '/search',  color: '#10B981' },
    { icon: 'flag',       label: 'Reports',     path: '/reports', color: '#F59E0B' },
    { icon: 'security',   label: 'Safety',      path: '/safety',  color: '#7C3AED' },
    { icon: 'military_tech', label: 'Badges',   path: '/achievements', color: '#F59E0B' },
    { icon: 'sensors',    label: 'Permissions', path: null, action: requestPermissions, color: '#737686' },
    { icon: 'logout',     label: 'Sign Out',    path: null, action: handleLogout, color: '#EF4444', danger: true },
  ]

  const showContactsSection = true

  return (
    <div className="relative w-full h-full overflow-y-auto custom-scrollbar bg-[#f4f6f8] animate-fade-in">

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showAddModal  && <ContactModal onSave={handleAddContact} onClose={() => setShowAddModal(false)} />}
      {editContact   && <ContactModal contact={editContact} onSave={handleEditContact} onClose={() => setEditContact(null)} />}
      {deleteTarget  && <DeleteModal contactName={deleteTarget.name} onConfirm={handleDeleteContact} onClose={() => setDeleteTarget(null)} />}
      {editField?.key === 'name'  && (
        <EditFieldModal title="Display Name" value={editField.value} placeholder="Your name"
          onSave={handleSaveName} onClose={() => setEditField(null)} />
      )}
      {editField?.key === 'phone' && (
        <EditFieldModal title="Phone Number" value={editField.value} type="tel" placeholder="+91 XXXXX XXXXX"
          onSave={handleSavePhone} onClose={() => setEditField(null)} />
      )}
      
      {showMedicalSurvey && (
        <MedicalProfileSurvey
          isOpen={showMedicalSurvey}
          uid={auth.currentUser?.uid || ''}
          userName={user?.name || 'Citizen'}
          onClose={() => setShowMedicalSurvey(false)}
        />
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoSelect}
      />

      {/* ══════════════════════════════════════════════════
          GREEN HEADER
          ══════════════════════════════════════════════════ */}
      <div
        className="relative overflow-visible pt-10 pb-5 px-5"
        style={{ background: 'linear-gradient(160deg, #2D6A2D 0%, #1B5E20 55%, #145214 100%)' }}
      >
        {/* Dot pattern */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '18px 18px' }} />

        {/* Top bar: back + 3-dot menu */}
        <div className="relative z-10 flex items-center justify-between mb-5">
          <button onClick={() => navigate(-1)}
            className="w-8 h-8 flex items-center justify-center rounded-full active:scale-90 transition-transform"
            style={{ background: 'rgba(255,255,255,0.12)' }}>
            <span className="material-symbols-outlined text-white" style={{ fontSize: '20px' }}>arrow_back</span>
          </button>

          {/* Right side buttons: Badges + 3-dot menu */}
          <div className="flex items-center gap-2">
            {/* Badges shortcut button */}
            <button
              onClick={() => navigate('/achievements')}
              className="w-8 h-8 flex items-center justify-center rounded-full active:scale-90 transition-transform"
              style={{ background: 'rgba(255,255,255,0.12)' }}
              title="View Badges & Achievements"
            >
              <span className="material-symbols-outlined icon-filled text-white" style={{ fontSize: '20px' }}>military_tech</span>
            </button>

            {/* 3-dot menu — opens full-screen drawer from right */}
            <div className="relative">
              <button
                onClick={() => setShowMenu(s => !s)}
                className="w-8 h-8 flex items-center justify-center rounded-full active:scale-90 transition-transform"
                style={{ background: 'rgba(255,255,255,0.12)' }}>
                <span className="material-symbols-outlined text-white" style={{ fontSize: '20px' }}>more_vert</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Full-screen nav drawer (fixed, never clipped) ─────────────── */}
        {showMenu && (
          <div
            className="fixed inset-0 z-[9999]"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)' }}
            onClick={() => setShowMenu(false)}
          >
            <style>{`
              @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to   { transform: translateX(0);    opacity: 1; }
              }
              .profile-drawer { animation: slideInRight 0.25s cubic-bezier(0.4,0,0.2,1) both; }
            `}</style>
            <div
              className="profile-drawer absolute top-0 right-0 h-full bg-white flex flex-col shadow-2xl"
              style={{ width: 'min(300px, 82vw)' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Drawer header */}
              <div className="flex items-center gap-3 px-5 pt-12 pb-5"
                style={{ background: 'linear-gradient(135deg, #1B5E20, #2D6A2D)' }}>
                <div
                  className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 border-2 border-white/40"
                  style={{ background: 'rgba(255,255,255,0.18)' }}
                >
                  {user?.avatar
                    ? <img src={user.avatar} alt="avatar" className="w-full h-full object-cover" />
                    : <span className="w-full h-full flex items-center justify-center text-white font-black text-base">
                        {(user?.name || '?').trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                      </span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-black text-sm truncate">{user?.name || 'Guardian'}</p>
                  <p className="text-white/70 text-[11px] truncate">{user?.email || ''}</p>
                </div>
                <button
                  onClick={() => setShowMenu(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.18)' }}
                >
                  <span className="material-symbols-outlined text-white" style={{ fontSize: '18px' }}>close</span>
                </button>
              </div>

              {/* Nav items */}
              <div className="flex-1 overflow-y-auto py-3">
                {MENU_ITEMS.filter(m => !m.danger).map((item, i, arr) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      setShowMenu(false)
                      if (item.path) setTimeout(() => navigate(item.path), 50)
                      else if (item.action) setTimeout(() => item.action(), 50)
                    }}
                    className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-[#f7f9fb] active:bg-[#f0f4ff] transition-colors"
                    style={{ borderBottom: i < arr.length - 1 ? '1px solid #f2f4f6' : 'none' }}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: item.color + '15' }}
                    >
                      <span className="material-symbols-outlined icon-filled" style={{ color: item.color, fontSize: '19px' }}>{item.icon}</span>
                    </div>
                    <span className="text-sm font-semibold text-[#191c1e]">{item.label}</span>
                    <span className="material-symbols-outlined text-[#c3c6d7] ml-auto" style={{ fontSize: '16px' }}>chevron_right</span>
                  </button>
                ))}
              </div>

              {/* Sign Out at bottom */}
              <div className="px-4 pb-8 pt-2 border-t border-[#f0f2f5]">
                <button
                  onClick={() => { setShowMenu(false); setTimeout(() => handleLogout(), 50) }}
                  className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-[#FEF2F2] active:bg-[#FEE2E2] transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-[#FEF2F2] flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined icon-filled text-[#EF4444]" style={{ fontSize: '19px' }}>logout</span>
                  </div>
                  <span className="text-sm font-semibold text-[#EF4444]">Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Avatar + name row */}
        <div className="relative z-10 flex items-center gap-4">
          {/* Clickable avatar */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-[72px] h-[72px] rounded-full overflow-hidden flex items-center justify-center relative group active:scale-95 transition-transform"
              style={{ border: '3px solid rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.15)' }}
              title="Tap to change photo"
            >
              {uploadingPhoto ? (
                <span className="material-symbols-outlined text-white animate-spin" style={{ fontSize: '28px' }}>refresh</span>
              ) : user?.avatar ? (
                <img src={user.avatar} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="material-symbols-outlined text-white icon-filled" style={{ fontSize: '38px' }}>person</span>
              )}
              {/* Camera overlay */}
              <div
                className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity"
                style={{ background: 'rgba(0,0,0,0.4)', borderRadius: '50%' }}
              >
                <span className="material-symbols-outlined text-white icon-filled" style={{ fontSize: '22px' }}>photo_camera</span>
              </div>
            </button>
            {/* Camera badge */}
            <div
              className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: '#004ac6', border: '2px solid white' }}
            >
              <span className="material-symbols-outlined text-white icon-filled" style={{ fontSize: '12px' }}>edit</span>
            </div>
          </div>

          {/* Name + verified badge */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white tracking-tight leading-tight truncate">
                {user?.name || 'Safety Guardian User'}
              </h1>
              <button
                onClick={() => setEditField({ key: 'name', value: user?.name || '' })}
                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center active:scale-90"
                style={{ background: 'rgba(255,255,255,0.15)' }}
                title="Edit name"
              >
                <span className="material-symbols-outlined text-white" style={{ fontSize: '13px' }}>edit</span>
              </button>
            </div>

            {/* Verified badge */}
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="material-symbols-outlined icon-filled" style={{ color: '#10B981', fontSize: '14px' }}>verified</span>
              <span className="text-[11px] font-semibold text-white/90">Verified</span>
              <span className="text-[11px] text-white/55">· Citizen</span>
            </div>

            <p className="text-white/50 text-[11px] mt-0.5 truncate">{user?.email}</p>
          </div>
        </div>

        {/* Stats row — 4 cards inside the green header */}
        <div
          className="relative z-10 mt-5 grid grid-cols-4 gap-0 rounded-2xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)' }}
        >
          {STATS.map((s, i) => (
            <div
              key={s.label}
              className="flex flex-col items-center py-3 px-1"
              style={{ borderRight: i < 3 ? '1px solid rgba(255,255,255,0.1)' : 'none' }}
            >
              <span className="material-symbols-outlined icon-filled" style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>{s.icon}</span>
              <p className="text-white font-black text-base leading-tight mt-0.5">{s.value}</p>
              <p className="text-white/45 text-[8px] font-bold uppercase tracking-wider leading-tight text-center">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          SCROLLABLE CONTENT
          ══════════════════════════════════════════════════ */}
      <div className="pb-6">

        {/* ── MEDICAL PROFILE & ACHIEVEMENTS ──────────────── */}
        <div className="mx-4 mt-5 grid grid-cols-2 gap-3">
          {/* Medical Profile Card */}
          <button
            onClick={() => setShowMedicalSurvey(true)}
            className="flex flex-col items-start p-4 rounded-3xl border border-[#eceef0] bg-white shadow-sm active:scale-95 transition-all text-left"
          >
            <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center mb-3">
              <span className="material-symbols-outlined icon-filled text-rose-500">medical_services</span>
            </div>
            <p className="text-sm font-black text-[#191c1e]">Medical Profile</p>
            {medicalProfile?.bloodGroup ? (
              <p className="text-xs text-[#737686] mt-0.5 font-bold">Blood: <span className="text-rose-500">{medicalProfile.bloodGroup}</span></p>
            ) : (
              <p className="text-xs text-rose-500 mt-0.5 font-bold">Setup Required</p>
            )}
            <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3 overflow-hidden">
              <div 
                className="h-full bg-rose-500 rounded-full transition-all" 
                style={{ width: `${calculateProfileCompletion(medicalProfile)}%` }}
              />
            </div>
          </button>

          {/* Badges & Achievements Card */}
          <button
            onClick={() => navigate('/achievements')}
            className="flex flex-col items-start p-4 rounded-3xl border border-[#eceef0] bg-white shadow-sm active:scale-95 transition-all text-left"
          >
            <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center mb-3">
              <span className="material-symbols-outlined icon-filled text-amber-500">military_tech</span>
            </div>
            <p className="text-sm font-black text-[#191c1e]">Badges</p>
            <p className="text-xs text-[#737686] mt-0.5 font-bold">View Achievements</p>
            <div className="mt-auto pt-3 flex items-center gap-1">
              <span className="text-[10px] font-black text-amber-600 uppercase tracking-wider">Safety Rep</span>
            </div>
          </button>
        </div>

        {/* ── PERSONAL INFO ────────────────────────────────── */}
        <div className="mx-4 mt-5">
          <p className="text-[10px] font-black text-[#737686] uppercase tracking-widest mb-2 ml-1">Personal Info</p>
          <div className="bg-white rounded-2xl border border-[#eceef0] shadow-sm overflow-hidden">
            {/* Email */}
            <div className="flex items-center gap-4 px-4 py-4" style={{ borderBottom: '1px solid #f2f4f6' }}>
              <div className="w-10 h-10 rounded-full bg-[#f2f4f6] flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[#737686]" style={{ fontSize: '17px' }}>mail</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black text-[#737686] uppercase tracking-wider mb-0.5">EMAIL</p>
                <p className="text-sm font-semibold text-[#191c1e] truncate">{user?.email || 'Not set'}</p>
              </div>
              <span className="material-symbols-outlined text-[#c3c6d7]" style={{ fontSize: '16px' }}>lock</span>
            </div>
            {/* Phone — tappable to edit */}
            <button
              className="w-full flex items-center gap-4 px-4 py-4 text-left hover:bg-[#f7f9fb] transition-colors active:bg-[#eceef0]"
              onClick={() => setEditField({ key: 'phone', value: user?.phone || '' })}
            >
              <div className="w-10 h-10 rounded-full bg-[#f2f4f6] flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[#737686]" style={{ fontSize: '17px' }}>phone</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black text-[#737686] uppercase tracking-wider mb-0.5">PHONE</p>
                <p className="text-sm font-semibold text-[#191c1e] truncate">
                  {user?.phone || <span className="text-[#c3c6d7] italic font-normal">Tap to add phone number</span>}
                </p>
              </div>
              <span className="material-symbols-outlined text-[#004ac6]" style={{ fontSize: '16px' }}>edit</span>
            </button>
          </div>
        </div>

        {/* ── EMERGENCY CONTACTS ───────────────────────────── */}
        <div className="mx-4 mt-5">
          <div className="flex items-center justify-between mb-2 ml-1">
            <p className="text-[10px] font-black text-[#737686] uppercase tracking-widest">Emergency Contacts</p>
            <div className="flex items-center gap-1.5">
              {/* Import from Phone */}
              <button
                onClick={handleImportContacts}
                disabled={importingContacts || saving}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all active:scale-95 disabled:opacity-40"
                style={{ background: 'rgba(0,74,198,0.1)', color: '#004ac6', border: '1px solid rgba(0,74,198,0.2)' }}
                title="Import contacts from your phone"
              >
                {importingContacts
                  ? <span className="material-symbols-outlined animate-spin" style={{ fontSize: '12px' }}>refresh</span>
                  : <span className="material-symbols-outlined icon-filled" style={{ fontSize: '12px' }}>contacts</span>
                }
                Import
              </button>
              {/* Add manually */}
              <button
                onClick={() => setShowAddModal(true)}
                disabled={saving}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold text-white active:scale-95 transition-all"
                style={{ background: '#1B5E20' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>add</span>
                ADD
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[#eceef0] shadow-sm overflow-hidden">
            {contactsLoading ? (
              <div className="py-8 text-center">
                <span className="material-symbols-outlined animate-spin text-[#737686]" style={{ fontSize: '24px' }}>refresh</span>
                <p className="text-xs text-[#737686] mt-2">Loading contacts…</p>
              </div>
            ) : contactsError ? (
              <div className="py-8 text-center px-4">
                <span className="material-symbols-outlined text-[#EF4444]" style={{ fontSize: '24px' }}>error</span>
                <p className="text-xs text-[#EF4444] mt-2">Unable to load emergency contacts.</p>
              </div>
            ) : emergencyContacts.length === 0 ? (
              <div className="py-8 text-center px-4">
                <span className="material-symbols-outlined text-[#c3c6d7]" style={{ fontSize: '36px' }}>contacts</span>
                <p className="text-sm font-semibold text-[#737686] mt-2">No emergency contacts yet.</p>
                <p className="text-xs text-[#737686]/70 mt-1">Add contacts or import from your phone.</p>
                <div className="flex items-center justify-center gap-2 mt-3">
                  <button onClick={handleImportContacts}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold active:scale-95 transition-all"
                    style={{ background: 'rgba(0,74,198,0.1)', color: '#004ac6' }}>
                    <span className="material-symbols-outlined icon-filled" style={{ fontSize: '13px' }}>contacts</span>
                    Import
                  </button>
                  <button onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold text-white active:scale-95"
                    style={{ background: '#1B5E20' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>add</span>
                    Add Manually
                  </button>
                </div>
              </div>
            ) : (
              emergencyContacts.map((c, i) => {
                const col  = getColor(c.name)
                const last = i === emergencyContacts.length - 1
                return (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-3.5"
                    style={{ borderBottom: !last ? '1px solid #f2f4f6' : 'none' }}>
                    <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 font-black text-white text-sm"
                      style={{ background: col }}>
                      {initials(c.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[#191c1e]">{c.name}</p>
                      <p className="text-xs text-[#737686] mt-0.5">
                        {c.relationship && <span>{c.relationship} · </span>}
                        {c.phone}
                      </p>
                    </div>
                    <button onClick={() => setEditContact(c)}
                      className="w-8 h-8 rounded-full bg-[#f2f4f6] flex items-center justify-center active:scale-90 transition-transform">
                      <span className="material-symbols-outlined text-[#737686]" style={{ fontSize: '16px' }}>edit</span>
                    </button>
                    <button onClick={() => setDeleteTarget(c)}
                      className="w-8 h-8 rounded-full bg-[#FEF2F2] flex items-center justify-center active:scale-90 transition-transform">
                      <span className="material-symbols-outlined icon-filled text-[#EF4444]" style={{ fontSize: '16px' }}>delete</span>
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ── SAFETY PREFERENCES ──────────────────────────── */}
        <div className="mx-4 mt-5">
          <p className="text-[10px] font-black text-[#737686] uppercase tracking-widest mb-2 ml-1">Safety Preferences</p>
          <div className="bg-white rounded-2xl border border-[#eceef0] shadow-sm overflow-hidden">
            {[
              { key: 'liveFriendTracking', icon: 'group_add', color: '#8B5CF6', label: 'Live Friend Tracking', desc: 'Share location with trusted friends' },
              { key: 'avoidUnlit',    icon: 'wb_sunny',      color: '#F59E0B', label: 'Avoid Unlit Streets',  desc: 'Reroute to paths with high lamp density' },
              { key: 'autoShareWalk', icon: 'share_location', color: '#004ac6', label: 'Auto-Share Walk',      desc: 'Notify contacts when you start moving' },
              { key: 'safeZoneAlerts',icon: 'shield',         color: '#10B981', label: 'Safe Zone Alerts',     desc: 'Alert when leaving designated safe areas' },
            ].map((p, i, arr) => (
              <div key={p.key} className="flex items-center gap-3 px-4 py-4"
                style={{ borderBottom: i < arr.length - 1 ? '1px solid #f2f4f6' : 'none' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: p.color + '18' }}>
                  <span className="material-symbols-outlined icon-filled" style={{ color: p.color, fontSize: '18px' }}>{p.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#191c1e]">{p.label}</p>
                  <p className="text-xs text-[#737686] mt-0.5 leading-snug">{p.desc}</p>
                </div>
                <Toggle on={prefs[p.key]} onChange={() => setPrefs({ [p.key]: !prefs[p.key] })} />
              </div>
            ))}
          </div>
        </div>

        {/* ── PERMISSIONS ──────────────────────────────────── */}
        <div className="mx-4 mt-5">
          <p className="text-[10px] font-black text-[#737686] uppercase tracking-widest mb-2 ml-1">App Permissions</p>
          <div className="bg-white rounded-2xl border border-[#eceef0] shadow-sm overflow-hidden">
            {[
              { icon: 'location_on', label: 'Location Access', desc: 'Required for live navigation & safety scores', color: '#004ac6',
                action: () => navigator.geolocation?.getCurrentPosition(() => alert('✅ Location permission granted!'), () => alert('❌ Location denied. Please enable in browser settings.')) },
              { icon: 'photo_camera', label: 'Camera Access', desc: 'Used for profile photo and hazard evidence', color: '#10B981',
                action: async () => { try { const s = await navigator.mediaDevices.getUserMedia({ video: true }); s.getTracks().forEach(t => t.stop()); alert('✅ Camera permission granted!') } catch { alert('❌ Camera denied. Please enable in browser settings.') } } },
              { icon: 'contacts', label: 'Contacts Access', desc: 'Import emergency contacts from your phone', color: '#7C3AED',
                action: handleImportContacts },
            ].map((p, i, arr) => (
              <button key={p.label} onClick={p.action}
                className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-[#f7f9fb] active:bg-[#eceef0] transition-colors"
                style={{ borderBottom: i < arr.length - 1 ? '1px solid #f2f4f6' : 'none' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: p.color + '15' }}>
                  <span className="material-symbols-outlined icon-filled" style={{ color: p.color, fontSize: '18px' }}>{p.icon}</span>
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold text-[#191c1e]">{p.label}</p>
                  <p className="text-xs text-[#737686] mt-0.5">{p.desc}</p>
                </div>
                <span className="material-symbols-outlined text-[#c3c6d7]" style={{ fontSize: '18px' }}>chevron_right</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── APP VERSION ──────────────────────────────────── */}
        <div className="mx-4 mt-5">
          <div className="bg-white rounded-2xl border border-[#eceef0] shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-4" style={{ borderBottom: '1px solid #f2f4f6' }}>
              <div className="w-10 h-10 rounded-full bg-[#004ac6]/10 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined icon-filled text-[#004ac6]" style={{ fontSize: '18px' }}>shield</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-[#191c1e]">Safety Guardian</p>
                <p className="text-xs text-[#737686] mt-0.5">Version 2.0.0 · Hackathon Edition</p>
              </div>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full text-white" style={{ background: '#10B981' }}>LIVE</span>
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-10 h-10 rounded-full bg-[#10B981]/10 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined icon-filled text-[#10B981]" style={{ fontSize: '18px' }}>verified_user</span>
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-[#191c1e]">Real-time Hazard Reports</p>
                <p className="text-xs text-[#737686]">Firebase · OpenStreetMap · GPS</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── SIGN OUT ──────────────────────────────────────── */}
        <div className="mx-4 mt-4 mb-2">
          <button onClick={handleLogout}
            className="w-full py-4 rounded-2xl bg-white border border-[#eceef0] shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2">
            <span className="material-symbols-outlined icon-filled text-[#EF4444]" style={{ fontSize: '18px' }}>logout</span>
            <span className="text-[#EF4444] font-bold text-sm">Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  )
}