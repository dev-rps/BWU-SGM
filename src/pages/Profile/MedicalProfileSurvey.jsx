/**
 * MedicalProfileSurvey.jsx — Guided Survey-Style Medical Profile
 *
 * Design Philosophy:
 *  - Mobile-first, calm medical green & blue accents
 *  - Large touch targets, minimal typing
 *  - Multi-select chips for Blood Group, Conditions & Allergies
 *  - Interactive card-based medication & emergency contact managers
 *  - Real-time save to Firestore & localStorage
 */

import { useState, useEffect } from 'react'
import { loadMedicalProfile, saveMedicalProfile, calculateProfileCompletion } from '../../services/medicalService'

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

const CONDITIONS = [
  { id: 'Diabetes', label: 'Diabetes', icon: 'bloodtype' },
  { id: 'Asthma', label: 'Asthma', icon: 'air' },
  { id: 'Hypertension', label: 'Hypertension (High BP)', icon: 'speed' },
  { id: 'Heart Disease', label: 'Heart Disease', icon: 'favorite' },
  { id: 'Epilepsy', label: 'Epilepsy / Seizure', icon: 'bolt' },
  { id: 'Kidney Disease', label: 'Kidney Disease', icon: 'water_drop' },
  { id: 'Pregnancy', label: 'Pregnancy', icon: 'pregnant_woman' },
  { id: 'Severe Allergies', label: 'Severe Allergies', icon: 'coronavirus' },
  { id: 'Other', label: 'Other Condition', icon: 'medical_information' },
]

const ALLERGIES = [
  { id: 'Penicillin', label: 'Penicillin', icon: 'medication' },
  { id: 'Nuts', label: 'Peanuts / Tree Nuts', icon: 'nutrition' },
  { id: 'Seafood', label: 'Seafood / Shellfish', icon: 'set_meal' },
  { id: 'Eggs', label: 'Eggs', icon: 'egg' },
  { id: 'Milk', label: 'Dairy / Milk', icon: 'local_drink' },
  { id: 'Dust', label: 'Dust Mites', icon: 'grain' },
  { id: 'Pollen', label: 'Pollen', icon: 'park' },
  { id: 'Bee Stings', label: 'Bee Stings', icon: 'bug_report' },
  { id: 'Latex', label: 'Latex', icon: 'healing' },
  { id: 'Other', label: 'Other Allergy', icon: 'warning' },
]

const FREQUENCIES = ['Once Daily', 'Twice Daily', '3x Daily', 'As Needed', 'Weekly']
const RELATIONSHIPS = ['Parent', 'Spouse', 'Child', 'Sibling', 'Friend', 'Doctor', 'Other']

export default function MedicalProfileSurvey({ uid, userName, onClose, onSaved }) {
  const [step, setStep] = useState(1) // 1: Personal, 2: Conditions, 3: Allergies, 4: Medicines, 5: Contacts, 6: Doctor & Insurance
  const totalSteps = 6

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Form State
  const [bloodGroup, setBloodGroup] = useState('')
  const [age, setAge] = useState('')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')

  const [conditions, setConditions] = useState([])
  const [otherCondition, setOtherCondition] = useState('')

  const [allergies, setAllergies] = useState([])
  const [otherAllergy, setOtherAllergy] = useState('')

  const [medicines, setMedicines] = useState([])
  const [newMedName, setNewMedName] = useState('')
  const [newMedDosage, setNewMedDosage] = useState('')
  const [newMedFreq, setNewMedFreq] = useState('Once Daily')
  const [newMedNotes, setNewMedNotes] = useState('')
  const [showAddMed, setShowAddMed] = useState(false)

  const [contacts, setContacts] = useState([])
  const [newContactName, setNewContactName] = useState('')
  const [newContactRel, setNewContactRel] = useState('Parent')
  const [newContactPhone, setNewContactPhone] = useState('')
  const [newContactPriority, setNewContactPriority] = useState('1')
  const [showAddContact, setShowAddContact] = useState(false)

  const [doctorName, setDoctorName] = useState('')
  const [doctorHospital, setDoctorHospital] = useState('')
  const [doctorPhone, setDoctorPhone] = useState('')

  const [insuranceProvider, setInsuranceProvider] = useState('')
  const [insurancePolicyNumber, setInsurancePolicyNumber] = useState('')

  // Load existing profile
  useEffect(() => {
    async function fetchProfile() {
      setLoading(true)
      const data = await loadMedicalProfile(uid)
      if (data) {
        setBloodGroup(data.bloodGroup || '')
        setAge(data.age || '')
        setHeight(data.height || '')
        setWeight(data.weight || '')
        setConditions(data.conditions || [])
        setOtherCondition(data.otherCondition || '')
        setAllergies(data.allergies || [])
        setOtherAllergy(data.otherAllergy || '')
        setMedicines(data.medicines || [])
        setContacts(data.emergencyContacts || [])
        setDoctorName(data.doctorName || '')
        setDoctorHospital(data.doctorHospital || '')
        setDoctorPhone(data.doctorPhone || '')
        setInsuranceProvider(data.insuranceProvider || '')
        setInsurancePolicyNumber(data.insurancePolicyNumber || '')
      }
      setLoading(false)
    }
    fetchProfile()
  }, [uid])

  const toggleCondition = (id) => {
    setConditions(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  const toggleAllergy = (id) => {
    setAllergies(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id])
  }

  const handleAddMedicine = () => {
    if (!newMedName.trim()) return
    const next = [
      ...medicines,
      {
        id: Date.now().toString(),
        name: newMedName.trim(),
        dosage: newMedDosage.trim(),
        frequency: newMedFreq,
        notes: newMedNotes.trim(),
      },
    ]
    setMedicines(next)
    setNewMedName('')
    setNewMedDosage('')
    setNewMedNotes('')
    setShowAddMed(false)
  }

  const handleRemoveMedicine = (id) => {
    setMedicines(prev => prev.filter(m => m.id !== id))
  }

  const handleAddContact = () => {
    if (!newContactName.trim() || !newContactPhone.trim()) return
    const next = [
      ...contacts,
      {
        id: Date.now().toString(),
        name: newContactName.trim(),
        relationship: newContactRel,
        phone: newContactPhone.trim(),
        priority: newContactPriority,
      },
    ]
    setContacts(next)
    setNewContactName('')
    setNewContactPhone('')
    setShowAddContact(false)
  }

  const handleRemoveContact = (id) => {
    setContacts(prev => prev.filter(c => c.id !== id))
  }

  const handleSave = async () => {
    setSaving(true)
    const payload = {
      bloodGroup,
      age,
      height,
      weight,
      conditions,
      otherCondition,
      allergies,
      otherAllergy,
      medicines,
      emergencyMedicines: medicines.map(m => m.name),
      emergencyContacts: contacts,
      doctorName,
      doctorHospital,
      doctorPhone,
      insuranceProvider,
      insurancePolicyNumber,
    }

    await saveMedicalProfile(uid, payload)
    setSaving(false)
    setSaveSuccess(true)
    if (onSaved) onSaved(payload)
    setTimeout(() => {
      setSaveSuccess(false)
      onClose()
    }, 800)
  }

  const currentProfileObj = {
    bloodGroup,
    age,
    height,
    weight,
    conditions,
    allergies,
    medicines,
    doctorName,
    doctorPhone,
    emergencyContacts: contacts,
  }
  const completion = calculateProfileCompletion(currentProfileObj)

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-3xl p-6 flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[#10B981] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-bold text-[#1F2937]">Loading your medical profile…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-[#F9FAFB] animate-fade-in overflow-hidden">
      {/* ── Top Header Bar ── */}
      <div className="bg-white border-b border-[#E5E7EB] px-4 pt-10 pb-4 shadow-sm flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={step > 1 ? () => setStep(s => s - 1) : onClose}
              className="w-10 h-10 rounded-2xl bg-[#F3F4F6] hover:bg-[#E5E7EB] active:scale-95 flex items-center justify-center transition-colors"
              title={step > 1 ? "Previous Step" : "Close Survey"}
            >
              <span className="material-symbols-outlined text-[#374151]" style={{ fontSize: 22 }}>
                {step > 1 ? 'arrow_back' : 'close'}
              </span>
            </button>
            <div>
              <h2 className="text-base font-black text-[#111827] leading-tight">Medical Profile</h2>
              <p className="text-[10px] text-[#6B7280]">Step {step} of {totalSteps} ({completion}% Done)</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {step < totalSteps ? (
              <button
                onClick={() => setStep(s => s + 1)}
                className="h-10 px-4 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-black flex items-center gap-1 active:scale-95 transition-all shadow-sm"
              >
                <span>Next</span>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_forward</span>
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={saving}
                className="h-10 px-4 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-black flex items-center gap-1 active:scale-95 transition-all shadow-sm disabled:opacity-50"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : saveSuccess ? (
                  <span>Saved!</span>
                ) : (
                  <>
                    <span>Save</span>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Step Progress Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] font-bold text-[#6B7280]">
            <span>Step {step} of {totalSteps}: {
              step === 1 ? 'Personal Vitals' :
              step === 2 ? 'Medical Conditions' :
              step === 3 ? 'Known Allergies' :
              step === 4 ? 'Current Medications' :
              step === 5 ? 'Emergency Contacts' : 'Doctor & Insurance'
            }</span>
            <span>{Math.round((step / totalSteps) * 100)}%</span>
          </div>
          <div className="w-full h-2 bg-[#E5E7EB] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#10B981] transition-all duration-300 rounded-full"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Scrollable Survey Body ── */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">

        {/* STEP 1: PERSONAL VITALS & BLOOD GROUP */}
        {step === 1 && (
          <div className="space-y-4 animate-slide-up">
            <div className="bg-white rounded-3xl p-5 border border-[#E5E7EB] shadow-sm space-y-4">
              <div>
                <label className="block text-xs font-black text-[#374151] uppercase tracking-wider mb-2">
                  🩸 Select Blood Group *
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {BLOOD_GROUPS.map(bg => (
                    <button
                      key={bg}
                      onClick={() => setBloodGroup(bg)}
                      className={`h-12 rounded-2xl font-black text-sm transition-all active:scale-95 flex items-center justify-center ${
                        bloodGroup === bg
                          ? 'bg-[#DC2626] text-white shadow-md shadow-red-200'
                          : 'bg-[#F9FAFB] border border-[#E5E7EB] text-[#374151] hover:bg-slate-50'
                      }`}
                    >
                      {bg}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-[#F3F4F6]">
                <label className="block text-xs font-black text-[#374151] uppercase tracking-wider mb-2">
                  🎂 Age &amp; Physical Vitals
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-[#6B7280] block mb-1">Age</span>
                    <input
                      type="number"
                      value={age}
                      onChange={e => setAge(e.target.value)}
                      placeholder="e.g. 24"
                      className="w-full h-12 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-3 text-center text-sm font-bold text-[#111827] outline-none focus:border-[#10B981]"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-[#6B7280] block mb-1">Height (cm)</span>
                    <input
                      type="number"
                      value={height}
                      onChange={e => setHeight(e.target.value)}
                      placeholder="e.g. 172"
                      className="w-full h-12 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-3 text-center text-sm font-bold text-[#111827] outline-none focus:border-[#10B981]"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-[#6B7280] block mb-1">Weight (kg)</span>
                    <input
                      type="number"
                      value={weight}
                      onChange={e => setWeight(e.target.value)}
                      placeholder="e.g. 68"
                      className="w-full h-12 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-3 text-center text-sm font-bold text-[#111827] outline-none focus:border-[#10B981]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: MEDICAL CONDITIONS (MULTI-SELECT) */}
        {step === 2 && (
          <div className="space-y-4 animate-slide-up">
            <div className="bg-white rounded-3xl p-5 border border-[#E5E7EB] shadow-sm space-y-3">
              <div>
                <h3 className="text-sm font-black text-[#111827]">Existing Medical Conditions</h3>
                <p className="text-xs text-[#6B7280]">Tap all that apply to help Momo assist in emergencies.</p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                {CONDITIONS.map(c => {
                  const isSelected = conditions.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleCondition(c.id)}
                      className={`p-3 rounded-2xl border text-left transition-all active:scale-95 flex items-center gap-2.5 ${
                        isSelected
                          ? 'bg-[#ECFDF5] border-[#10B981] text-[#065F46] shadow-sm'
                          : 'bg-[#F9FAFB] border-[#E5E7EB] text-[#374151] hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className={`material-symbols-outlined text-[20px] ${isSelected ? 'text-[#10B981] icon-filled' : 'text-[#6B7280]'}`}
                      >
                        {c.icon}
                      </span>
                      <span className="text-xs font-bold truncate flex-1">{c.label}</span>
                      {isSelected && <span className="text-xs font-black text-[#10B981]">✓</span>}
                    </button>
                  )
                })}
              </div>

              {conditions.includes('Other') && (
                <div className="pt-2">
                  <label className="block text-[11px] font-bold text-[#6B7280] mb-1">Specify Other Condition:</label>
                  <input
                    type="text"
                    value={otherCondition}
                    onChange={e => setOtherCondition(e.target.value)}
                    placeholder="e.g. Thyroid, Migraines, Arthritis"
                    className="w-full h-11 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 text-xs font-bold text-[#111827] outline-none focus:border-[#10B981]"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: ALLERGIES (MULTI-SELECT) */}
        {step === 3 && (
          <div className="space-y-4 animate-slide-up">
            <div className="bg-white rounded-3xl p-5 border border-[#E5E7EB] shadow-sm space-y-3">
              <div>
                <h3 className="text-sm font-black text-[#111827]">Known Allergies &amp; Sensitivities</h3>
                <p className="text-xs text-[#6B7280]">Select allergies to prevent wrong medication during emergencies.</p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                {ALLERGIES.map(a => {
                  const isSelected = allergies.includes(a.id)
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggleAllergy(a.id)}
                      className={`p-3 rounded-2xl border text-left transition-all active:scale-95 flex items-center gap-2.5 ${
                        isSelected
                          ? 'bg-[#FEF2F2] border-[#EF4444] text-[#991B1B] shadow-sm'
                          : 'bg-[#F9FAFB] border-[#E5E7EB] text-[#374151] hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className={`material-symbols-outlined text-[20px] ${isSelected ? 'text-[#EF4444] icon-filled' : 'text-[#6B7280]'}`}
                      >
                        {a.icon}
                      </span>
                      <span className="text-xs font-bold truncate flex-1">{a.label}</span>
                      {isSelected && <span className="text-xs font-black text-[#EF4444]">✓</span>}
                    </button>
                  )
                })}
              </div>

              {allergies.includes('Other') && (
                <div className="pt-2">
                  <label className="block text-[11px] font-bold text-[#6B7280] mb-1">Specify Other Allergy:</label>
                  <input
                    type="text"
                    value={otherAllergy}
                    onChange={e => setOtherAllergy(e.target.value)}
                    placeholder="e.g. Aspirin, Sulfa drugs, Soy"
                    className="w-full h-11 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 text-xs font-bold text-[#111827] outline-none focus:border-[#EF4444]"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 4: CURRENT MEDICATIONS */}
        {step === 4 && (
          <div className="space-y-4 animate-slide-up">
            <div className="bg-white rounded-3xl p-5 border border-[#E5E7EB] shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-[#111827]">Current Medications</h3>
                  <p className="text-xs text-[#6B7280]">Add regular or emergency medicines you take.</p>
                </div>
                <button
                  onClick={() => setShowAddMed(true)}
                  className="px-3 py-1.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold flex items-center gap-1 active:scale-95 shadow-sm"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                  <span>Add Medicine</span>
                </button>
              </div>

              {medicines.length === 0 && !showAddMed ? (
                <div className="text-center py-6 border-2 border-dashed border-[#E5E7EB] rounded-2xl">
                  <span className="material-symbols-outlined text-[#9CA3AF]" style={{ fontSize: 32 }}>medication</span>
                  <p className="text-xs font-bold text-[#6B7280] mt-1">No medicines added yet</p>
                  <button
                    onClick={() => setShowAddMed(true)}
                    className="mt-2 text-xs font-bold text-[#10B981] hover:underline"
                  >
                    + Tap to add your first medicine
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {medicines.map(m => (
                    <div
                      key={m.id}
                      className="p-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl flex items-center justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-black text-[#111827] truncate">{m.name}</p>
                          {m.dosage && (
                            <span className="text-[10px] bg-slate-200 text-[#374151] px-1.5 py-0.2 rounded font-bold">
                              {m.dosage}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#6B7280] mt-0.5">
                          ⏰ {m.frequency} {m.notes ? `· Note: ${m.notes}` : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemoveMedicine(m.id)}
                        className="w-8 h-8 rounded-xl text-[#EF4444] hover:bg-red-50 flex items-center justify-center flex-shrink-0"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Medicine Mini Modal / Form */}
              {showAddMed && (
                <div className="p-4 bg-[#ECFDF5] border border-[#A7F3D0] rounded-2xl space-y-3 animate-fade-in mt-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black text-[#065F46]">New Medicine Entry</p>
                    <button onClick={() => setShowAddMed(false)} className="text-[#065F46]">
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                    </button>
                  </div>

                  <input
                    type="text"
                    value={newMedName}
                    onChange={e => setNewMedName(e.target.value)}
                    placeholder="Medicine Name (e.g. Metformin, Salbutamol Inhaler)"
                    className="w-full h-11 bg-white border border-[#A7F3D0] rounded-xl px-3 text-xs font-bold text-[#111827] outline-none"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={newMedDosage}
                      onChange={e => setNewMedDosage(e.target.value)}
                      placeholder="Dosage (e.g. 500mg / 2 puffs)"
                      className="w-full h-11 bg-white border border-[#A7F3D0] rounded-xl px-3 text-xs font-bold text-[#111827] outline-none"
                    />
                    <select
                      value={newMedFreq}
                      onChange={e => setNewMedFreq(e.target.value)}
                      className="w-full h-11 bg-white border border-[#A7F3D0] rounded-xl px-2 text-xs font-bold text-[#111827] outline-none"
                    >
                      {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>

                  <input
                    type="text"
                    value={newMedNotes}
                    onChange={e => setNewMedNotes(e.target.value)}
                    placeholder="Optional notes (e.g. Take after meals)"
                    className="w-full h-10 bg-white border border-[#A7F3D0] rounded-xl px-3 text-xs text-[#111827] outline-none"
                  />

                  <button
                    onClick={handleAddMedicine}
                    disabled={!newMedName.trim()}
                    className="w-full h-10 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-black disabled:opacity-50 active:scale-95"
                  >
                    Save Medicine
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 5: EMERGENCY CONTACTS */}
        {step === 5 && (
          <div className="space-y-4 animate-slide-up">
            <div className="bg-white rounded-3xl p-5 border border-[#E5E7EB] shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-[#111827]">Emergency Contacts</h3>
                  <p className="text-xs text-[#6B7280]">People alerted when you trigger SOS or medical alerts.</p>
                </div>
                <button
                  onClick={() => setShowAddContact(true)}
                  className="px-3 py-1.5 rounded-xl bg-[#004ac6] hover:bg-[#003bb0] text-white text-xs font-bold flex items-center gap-1 active:scale-95 shadow-sm"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>person_add</span>
                  <span>Add Contact</span>
                </button>
              </div>

              {contacts.length === 0 && !showAddContact ? (
                <div className="text-center py-6 border-2 border-dashed border-[#E5E7EB] rounded-2xl">
                  <span className="material-symbols-outlined text-[#9CA3AF]" style={{ fontSize: 32 }}>contact_phone</span>
                  <p className="text-xs font-bold text-[#6B7280] mt-1">No emergency contacts saved</p>
                  <button
                    onClick={() => setShowAddContact(true)}
                    className="mt-2 text-xs font-bold text-[#004ac6] hover:underline"
                  >
                    + Add your primary contact
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {contacts.map((c, idx) => (
                    <div
                      key={c.id || idx}
                      className="p-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl flex items-center justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-[#004ac6] text-white text-[10px] font-black flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <p className="text-xs font-black text-[#111827] truncate">{c.name}</p>
                          <span className="text-[10px] bg-blue-100 text-[#004ac6] px-1.5 py-0.2 rounded font-bold">
                            {c.relationship}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#6B7280] mt-0.5 ml-7">
                          📞 {c.phone}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemoveContact(c.id)}
                        className="w-8 h-8 rounded-xl text-[#EF4444] hover:bg-red-50 flex items-center justify-center flex-shrink-0"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Contact Form */}
              {showAddContact && (
                <div className="p-4 bg-[#EFF6FF] border border-[#BFDBFE] rounded-2xl space-y-3 animate-fade-in mt-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black text-[#1E40AF]">New Emergency Contact</p>
                    <button onClick={() => setShowAddContact(false)} className="text-[#1E40AF]">
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                    </button>
                  </div>

                  <input
                    type="text"
                    value={newContactName}
                    onChange={e => setNewContactName(e.target.value)}
                    placeholder="Full Name (e.g. Sarah Jenkins)"
                    className="w-full h-11 bg-white border border-[#BFDBFE] rounded-xl px-3 text-xs font-bold text-[#111827] outline-none"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={newContactRel}
                      onChange={e => setNewContactRel(e.target.value)}
                      className="w-full h-11 bg-white border border-[#BFDBFE] rounded-xl px-2 text-xs font-bold text-[#111827] outline-none"
                    >
                      {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <input
                      type="tel"
                      value={newContactPhone}
                      onChange={e => setNewContactPhone(e.target.value)}
                      placeholder="Phone (+91 XXXXX XXXXX)"
                      className="w-full h-11 bg-white border border-[#BFDBFE] rounded-xl px-3 text-xs font-bold text-[#111827] outline-none"
                    />
                  </div>

                  <button
                    onClick={handleAddContact}
                    disabled={!newContactName.trim() || !newContactPhone.trim()}
                    className="w-full h-10 rounded-xl bg-[#004ac6] hover:bg-[#003bb0] text-white text-xs font-black disabled:opacity-50 active:scale-95"
                  >
                    Save Contact
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 6: DOCTOR & INSURANCE (OPTIONAL) */}
        {step === 6 && (
          <div className="space-y-4 animate-slide-up">
            <div className="bg-white rounded-3xl p-5 border border-[#E5E7EB] shadow-sm space-y-4">
              <div>
                <h3 className="text-sm font-black text-[#111827]">Personal Doctor (Optional)</h3>
                <p className="text-xs text-[#6B7280]">Shown on medical dispatch alerts if emergency care is required.</p>
                <div className="space-y-2.5 mt-3">
                  <input
                    type="text"
                    value={doctorName}
                    onChange={e => setDoctorName(e.target.value)}
                    placeholder="Doctor Name (e.g. Dr. Rajesh Sharma)"
                    className="w-full h-11 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 text-xs font-bold text-[#111827] outline-none focus:border-[#10B981]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={doctorHospital}
                      onChange={e => setDoctorHospital(e.target.value)}
                      placeholder="Hospital / Clinic"
                      className="w-full h-11 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 text-xs font-bold text-[#111827] outline-none focus:border-[#10B981]"
                    />
                    <input
                      type="tel"
                      value={doctorPhone}
                      onChange={e => setDoctorPhone(e.target.value)}
                      placeholder="Doctor Phone (+91...)"
                      className="w-full h-11 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 text-xs font-bold text-[#111827] outline-none focus:border-[#10B981]"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-[#F3F4F6]">
                <h3 className="text-sm font-black text-[#111827]">Health Insurance (Optional)</h3>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <input
                    type="text"
                    value={insuranceProvider}
                    onChange={e => setInsuranceProvider(e.target.value)}
                    placeholder="Insurance Provider"
                    className="w-full h-11 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 text-xs font-bold text-[#111827] outline-none focus:border-[#10B981]"
                  />
                  <input
                    type="text"
                    value={insurancePolicyNumber}
                    onChange={e => setInsurancePolicyNumber(e.target.value)}
                    placeholder="Policy Number"
                    className="w-full h-11 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 text-xs font-bold text-[#111827] outline-none focus:border-[#10B981]"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
