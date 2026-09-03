/**
 * ReportDetailsForm.jsx
 *
 * Step 4 of the report form:
 *   - Description textarea (500 char limit)
 *   - Image upload with preview (gallery or camera)
 *   - Anonymous toggle switch
 *
 * Props:
 *   description          string
 *   onDescriptionChange  (str) => void
 *   imageFile            File | null
 *   onImageChange        (File|null) => void
 *   anonymous            boolean
 *   onAnonymousChange    (bool) => void
 */

import { useRef, useState } from 'react'

export default function ReportDetailsForm({
  description,
  onDescriptionChange,
  imageFile,
  onImageChange,
  anonymous,
  onAnonymousChange,
}) {
  const fileRef      = useRef(null)
  const [preview, setPreview] = useState(
    imageFile ? URL.createObjectURL(imageFile) : null
  )

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    onImageChange(file)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(URL.createObjectURL(file))
  }

  const removeImage = () => {
    onImageChange(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const remaining = 500 - description.length
  const isNearLimit = remaining <= 50

  return (
    <div className="flex flex-col gap-4">

      {/* ── Description ─────────────────────────────────────────────────── */}
      <div>
        <label className="text-xs font-bold text-[#737686] uppercase tracking-wider mb-2 block">
          Description
        </label>
        <textarea
          value={description}
          onChange={e => onDescriptionChange(e.target.value.slice(0, 500))}
          placeholder="Describe what happened. Mention useful details that may help other users — time, direction, nearby landmarks…"
          rows={4}
          className="w-full bg-[#f7f9fb] border border-[#eceef0] rounded-xl px-3.5 py-3 text-sm text-[#191c1e] outline-none focus:border-[#004ac6] resize-none placeholder:text-[#737686] transition-colors"
        />
        <p
          className={`text-[10px] mt-1 text-right font-semibold ${
            isNearLimit ? 'text-[#EF4444]' : 'text-[#737686]'
          }`}
        >
          {remaining} characters left
        </p>
      </div>

      {/* ── Photo upload ─────────────────────────────────────────────────── */}
      <div>
        <label className="text-xs font-bold text-[#737686] uppercase tracking-wider mb-2 block">
          Photo <span className="text-[#737686] font-normal normal-case">(optional)</span>
        </label>

        {preview ? (
          <div className="relative rounded-2xl overflow-hidden border border-[#eceef0] shadow-sm" style={{ height: '150px' }}>
            <img src={preview} alt="Report preview" className="w-full h-full object-cover" />
            {/* Remove overlay */}
            <button
              onClick={removeImage}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center active:scale-90 transition-transform"
            >
              <span className="material-symbols-outlined text-white" style={{ fontSize: '16px' }}>close</span>
            </button>
            {/* Replace overlay */}
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] font-bold px-2.5 py-1 rounded-full"
            >
              Replace
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-2xl border-2 border-dashed border-[#c3c6d7] flex flex-col items-center justify-center gap-2 hover:border-[#004ac6] hover:bg-[#004ac6]/3 transition-all active:scale-95"
            style={{ height: '100px' }}
          >
            <span className="material-symbols-outlined text-[#737686]" style={{ fontSize: '28px' }}>add_photo_alternate</span>
            <p className="text-xs font-semibold text-[#737686]">Tap to upload or take a photo</p>
          </button>
        )}

        {/* Hidden file input — accepts camera and gallery */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* ── Anonymous toggle ─────────────────────────────────────────────── */}
      <button
        onClick={() => onAnonymousChange(!anonymous)}
        className={`flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all active:scale-95 ${
          anonymous ? 'border-[#004ac6] bg-[#004ac6]/5' : 'border-[#eceef0] bg-white'
        }`}
      >
        {/* Icon */}
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
            anonymous ? 'bg-[#004ac6]/15' : 'bg-[#f2f4f6]'
          }`}
        >
          <span
            className={`material-symbols-outlined icon-filled transition-all`}
            style={{ color: anonymous ? '#004ac6' : '#737686', fontSize: '20px' }}
          >
            {anonymous ? 'visibility_off' : 'visibility'}
          </span>
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[#191c1e]">Report Anonymously</p>
          <p className="text-xs text-[#737686] mt-0.5">
            {anonymous
              ? 'Your name is hidden from other users'
              : 'Your name will be visible on the report'}
          </p>
        </div>

        {/* Toggle pill */}
        <div
          className={`w-12 h-6 rounded-full flex items-center transition-all flex-shrink-0 ${
            anonymous ? 'bg-[#004ac6] justify-end pr-1' : 'bg-[#d8dadc] justify-start pl-1'
          }`}
        >
          <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
        </div>
      </button>

    </div>
  )
}
