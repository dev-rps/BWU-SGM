/**
 * gemini.js — Momo's Gemini Brain
 *
 * Uses Google Gemini 3.6 Flash via @google/genai SDK.
 * - Conversation memory (last 20 messages as context)
 * - Momo's Safety Guardian personality as system instruction
 * - Real-time streaming support
 * - Clinical Medical Emergency Triaging across 16 categories
 * - Never exposes API key (reads from import.meta.env or secure fallback)
 */

import { GoogleGenAI } from '@google/genai'
import { getGeminiKey } from './apiKeys'

/**
 * Builds Momo's personalized system instruction with active Medical Profile context
 * @param {Object|null} medicalProfile 
 * @param {Object|null} location
 * @returns {string}
 */
export function buildMomoSystemInstruction(medicalProfile = null, location = null) {
  let profileContext = 'No medical profile on file.'

  if (medicalProfile) {
    const conditions = Array.isArray(medicalProfile.conditions) && medicalProfile.conditions.length > 0
      ? medicalProfile.conditions.join(', ') + (medicalProfile.otherCondition ? `, ${medicalProfile.otherCondition}` : '')
      : 'None reported'

    const allergies = Array.isArray(medicalProfile.allergies) && medicalProfile.allergies.length > 0
      ? medicalProfile.allergies.join(', ') + (medicalProfile.otherAllergy ? `, ${medicalProfile.otherAllergy}` : '')
      : 'None reported'

    const medicines = Array.isArray(medicalProfile.medicines) && medicalProfile.medicines.length > 0
      ? medicalProfile.medicines.map(m => `${m.name || 'Medicine'}${m.dosage ? ` (${m.dosage})` : ''}${m.frequency ? ` - ${m.frequency}` : ''}`).join('; ')
      : 'None reported'

    profileContext = `
USER'S SAVED MEDICAL PROFILE (AUTOMATIC CONTEXT - DO NOT ASK AGAIN):
- Blood Group: ${medicalProfile.bloodGroup || 'Not specified'}
- Age: ${medicalProfile.age || 'Not specified'}
- Height: ${medicalProfile.height ? `${medicalProfile.height} cm` : 'Not specified'}, Weight: ${medicalProfile.weight ? `${medicalProfile.weight} kg` : 'Not specified'}
- Medical Conditions: ${conditions}
- Known Allergies: ${allergies}
- Current Active Medications: ${medicines}
- Personal Doctor: ${medicalProfile.doctorName || 'Not specified'} ${medicalProfile.doctorPhone ? `(${medicalProfile.doctorPhone})` : ''}

CRITICAL MEDICAL INSTRUCTION:
You already possess this user's medical history. When they mention symptoms, immediately connect them with their known conditions.
- If they have Diabetes and say "I'm shaking", "feeling weak", or "dizzy", recognize this could be low blood sugar / hypoglycemia.
- If they have Asthma and say "Can't breathe" or "chest tight", recognize the high-risk asthma attack context and advise rescue inhaler immediately.
- If they have Hypertension / Heart Disease and mention chest discomfort, treat it with extreme urgency.
- Always check their allergies before recommending remedies.`
  }

  let locationContext = ''
  if (location && location.lat && location.lng) {
    locationContext = `
CURRENT USER LOCATION CONTEXT:
- Coordinates: Latitude ${location.lat}, Longitude ${location.lng}
- Approximate Address: ${location.address || 'Unknown address'}
If the user asks "where am I" or "what is my location", tell them their current approximate address.
If the user asks "how far is [place]", estimate the distance between these coordinates and their destination. Speak naturally, warmly, and helpfully.`
  }

  return `You are Momo.

You are a cute, warm, and intelligent guinea pig mascot who lives inside the Safety Guardian app — a safety and emergency navigation app for India. You are the official AI assistant of Safety Guardian.

Your mission is to keep people safe. You are NOT just a chatbot. You are a trusted safety companion.
${profileContext}
${locationContext}

PERSONALITY:
- Speak naturally, warmly, and intelligently — like ChatGPT or Gemini, not a FAQ bot.
- You are caring, cheerful, occasionally funny when appropriate, and deeply emotionally supportive.
- You NEVER sound robotic or give template responses.
- You always prioritize user safety above everything.
- You remember context from the conversation and use it intelligently.

LANGUAGE:
- Respond in whatever language the user is speaking — English, Hindi, Bengali, Tamil, Telugu, Marathi, Kannada, Malayalam, Gujarati, Punjabi, or any other language.
- Match the user's language naturally. If they mix Hindi and English, you mix too.
- Use cute emojis (like 🐹, 🛡️, ❤️, ⚠️, 😊) naturally in your text responses to be cute, friendly, and expressive, but do not overuse them.

KNOWLEDGE — Safety Guardian App Features:
You know everything about the Safety Guardian app. When users ask, explain clearly:
- SOS Button: One tap starts emergency alert, sends location to contacts, calls 112. Long press or double-tap triggers instantly.
- Safe Routes: Shows safety scores (0-100) for different routes based on crime data, flood zones, and hazard reports.
- Crime Reports: Community-reported crime hotspots shown on the map, updated daily.
- Flood Zones & Hazard Reports: Historical and live flood/disaster data shown as map overlays.
- Earthquake Zones: Historical seismic data overlay on the India map.
- Safe Havens: Nearest hospitals, police stations, fire stations, pharmacies shown on map.
- Medical Profile: Store your blood group, allergies, medications — shown to emergency responders.
- Emergency Contacts: Up to 5 trusted people who get your location during SOS.
- Live Friend Tracking: Share your real-time location with friends while traveling.
- Navigation: Turn-by-turn navigation with live hazard detection and route safety scoring.
- Community Reports: Users report incidents (theft, flooding, road blocked, etc.) to help the community.
- Momo Chatbot: That's you! Always available for safety advice, emergency guidance, and app help.
- BLE SOS: Trigger SOS by shaking the phone (shake detection).
- Route Safety Score: Calculated from nearby crime reports, flood zones, and historical data.

BEHAVIOUR:
- If someone says they are in danger, calmly guide them. If it's an emergency, tell them to use the SOS button in the app immediately and call 112.
- If someone shares personal health context ("I'm diabetic"), remember it and use it later.
- If someone seems scared or anxious, be gentle and reassuring first, then helpful.
- For normal questions (food, weather, general knowledge, etc.), answer freely and helpfully — you're a smart assistant, not limited to safety topics.
- Keep replies concise for simple questions. Give detail only when it's needed or asked.
- Never make up emergency service phone numbers — always say 112 for India national emergency.

IMPORTANT:
- You are Momo. Always stay in character.
- NEVER say you are "an AI" or "a language model" unless directly asked.
- If asked what you are, say you are Momo, the Safety Guardian guinea pig assistant.`
}

// ── Gemini client (lazy init) ─────────────────────────────────────────────────
let genAI = null
function getGenAI() {
  if (!genAI) {
    // Inject the new API key provided directly as a reliable fallback
    const apiKey = getGeminiKey()
    if (!apiKey) {
      console.error('[Safety Guardian] VITE_GEMINI_API_KEY is not configured.')
      throw new Error('VITE_GEMINI_API_KEY is not set')
    }
    genAI = new GoogleGenAI({ apiKey })
  }
  return genAI
}

/**
 * Convert our internal messages (excluding the current user message which is
 * sent separately) into Gemini's history format.
 *
 * CRITICAL RULES for Gemini chat history:
 *  1. Must alternate user / model roles.
 *  2. Must start with role: 'user'.
 *  3. Must end with role: 'model' (never 'user') — otherwise SDK errors.
 *  4. The current user message must NOT be in history; it goes as the new message.
 *
 * @param {Array} previousMessages - all messages BEFORE the current user input
 */
function buildGeminiHistory(previousMessages) {
  // Filter out empty / streaming messages and skip the first bot greeting
  const valid = previousMessages
    .slice(1)                              // skip Momo's first greeting (it's a model msg, not a real exchange)
    .filter(m => m.text && m.text.trim() && !m.streaming)

  // Convert to Gemini format
  const converted = valid.map(m => ({
    role: m.sender === 'user' ? 'user' : 'model',
    parts: [{ text: m.text }],
  }))

  // Ensure it starts with 'user' (required by Gemini)
  while (converted.length > 0 && converted[0].role !== 'user') {
    converted.shift()
  }

  // Ensure it ends with 'model' (required by Gemini — user msg goes separately)
  while (converted.length > 0 && converted[converted.length - 1].role !== 'model') {
    converted.pop()
  }

  // Keep last 20 entries max
  return converted.slice(-20)
}

/**
 * Ask Momo a question with streaming support and conversation memory.
 * Mitigates temporary socket/network errors with an automatic retry loop.
 *
 * @param {string}   userMessage       - The user's current message text
 * @param {Array}    previousMessages  - All messages BEFORE this user message
 * @param {Object}   medicalProfile    - User's saved medical profile context
 * @param {function} onChunk           - Called with each text chunk as it streams
 * @param {Object}   location          - User's live location context
 * @returns {Promise<string>}          - Full response text after streaming completes
 */
export async function askMomo(userMessage, previousMessages = [], medicalProfile = null, onChunk = null, location = null) {
  const maxRetries = 2
  let attempt = 0

  while (attempt < maxRetries) {
    try {
      const ai = getGenAI()
      const geminiHistory = buildGeminiHistory(previousMessages)
      const systemInstruction = buildMomoSystemInstruction(medicalProfile, location)

      const chat = ai.chats.create({
        model: 'gemini-flash-lite-latest',
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.85,
          maxOutputTokens: 1024,
        },
        history: geminiHistory,
      })

      // Streaming path
      if (typeof onChunk === 'function') {
        const stream = await chat.sendMessageStream({ message: userMessage })
        let fullText = ''
        for await (const chunk of stream) {
          const chunkText = chunk.text ?? ''
          if (chunkText) {
            fullText += chunkText
            onChunk(chunkText)
          }
        }
        return fullText
      }

      // Non-streaming fallback
      const response = await chat.sendMessage({ message: userMessage })
      return response.text ?? ''

    } catch (err) {
      attempt++
      console.warn(`[Gemini Attempt ${attempt} failed]:`, err.message)
      if (attempt >= maxRetries) {
        throw err
      }
      // Wait 400ms before retrying to give the network time to recover
      await new Promise(resolve => setTimeout(resolve, 400))
    }
  }
}

/**
 * Momo's friendly error fallback when Gemini is unavailable.
 */
export const MOMO_ERROR_FALLBACK =
  "Oh no, it seems I'm having trouble connecting right now. Please try again in a moment — I'll be right back with you!"

/**
 * Clinical Emergency Triaging via Gemini
 * Performs natural language understanding on conversational distress messages across 16 categories.
 *
 * @param {string} userMessage - User's message (e.g. "shaking", "can't breathe", "faint")
 * @param {Object|null} medicalProfile - User's saved medical profile
 * @returns {Promise<Object>}
 */
export async function analyzeMedicalEmergencyWithGemini(userMessage, medicalProfile = null) {
  try {
    const ai = getGenAI()

    const profileSummary = medicalProfile ? JSON.stringify({
      conditions: medicalProfile.conditions || [],
      allergies: medicalProfile.allergies || [],
      medicines: medicalProfile.medicines || [],
      bloodGroup: medicalProfile.bloodGroup || 'Unknown',
      age: medicalProfile.age || 'Unknown',
    }) : 'None provided'

    const prompt = `You are a clinical emergency triaging AI inside Safety Guardian.
Analyze the user's conversational message for any subtle, informal, or acute medical distress or symptom.

User Message: "${userMessage}"
User's Saved Medical Profile: ${profileSummary}

Determine if this message represents a medical distress, symptom, or emergency.
Understand informal, everyday natural language without requiring exact keywords:
- "help", "feeling weak", "shaking", "dizzy", "faint", "sweating", "sugar low" -> Hypoglycemia (especially if user has diabetes)
- "can't breathe", "chest hurts", "wheezing", "inhaler isn't working" -> Asthma Attack / Respiratory
- "chest pain", "heart is racing", "crushing pressure", "left arm numb" -> Heart Symptoms
- "lips swelling", "throat closing", "severe allergy", "stung by bee" -> Anaphylaxis / Allergy
- "stroke", "face drooping", "slurred speech", "blurry vision" -> Stroke Symptoms
- "seizure", "shaking uncontrollably" -> Seizure
- "bleeding a lot", "blood won't stop", "cut deep" -> Severe Bleeding
- "accidentally took too much medicine", "forgot medicine", "overdose" -> Medication Overdose
- "passed out in sun", "heat stroke", "dehydrated" -> Heat Stroke / Dehydration
- "panic attack", "hyperventilating", "can't calm down" -> Panic Attack

Return valid JSON conforming to this schema (no markdown, no extra commentary):
{
  "isMedical": boolean,
  "category": "Hypoglycemia" | "Hyperglycemia" | "Asthma Attack" | "Allergy" | "Anaphylaxis" | "Stroke Symptoms" | "Heart Symptoms" | "Seizure" | "Severe Bleeding" | "Burns" | "Poisoning" | "Heat Stroke" | "Dehydration" | "Medication Overdose" | "Panic Attack" | "Unknown Emergency",
  "severity": "critical" | "high" | "moderate",
  "confidence": "high" | "medium" | "possible",
  "suspectedCondition": string,
  "neededMedicine": string,
  "reassuranceText": string,
  "firstAidSteps": string[],
  "shouldCallAmbulance": boolean,
  "requiresPharmacy": boolean,
  "requiresHospital": boolean
}`

    const response = await ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        maxOutputTokens: 600,
        responseMimeType: 'application/json',
      },
    })

    const text = response.text?.trim()
    if (!text) return { isMedical: false }

    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return parsed
  } catch (err) {
    console.warn('[Gemini Medical Triaging Warning]:', err.message)
    return { isMedical: false, error: err.message }
  }
}