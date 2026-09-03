/**
 * momoAI.js — Momo's Brain
 *
 * Fully local, offline-capable AI response engine.
 * No external API calls. No user data leaves the device.
 *
 * Handles:
 *  - Emergency detection (English + Indian languages)
 *  - 30+ safety topic responses
 *  - Multilingual support (10 Indian languages)
 *  - Context-aware follow-up understanding
 *  - Dynamic quick action generation
 */

// ─── Language Registry ─────────────────────────────────────────────────────────
export const LANGUAGES = {
  en: { name: 'English',    code: 'en-IN' },
  hi: { name: 'हिंदी',      code: 'hi-IN' },
  bn: { name: 'বাংলা',      code: 'bn-IN' },
  ta: { name: 'தமிழ்',     code: 'ta-IN' },
  te: { name: 'తెలుగు',    code: 'te-IN' },
  mr: { name: 'मराठी',     code: 'mr-IN' },
  kn: { name: 'ಕನ್ನಡ',     code: 'kn-IN' },
  ml: { name: 'മലയാളം',   code: 'ml-IN' },
  gu: { name: 'ગુજરાતી',  code: 'gu-IN' },
  pa: { name: 'ਪੰਜਾਬੀ',   code: 'pa-IN' },
}

// ─── Script Range Detection ────────────────────────────────────────────────────
export function detectLanguage(text) {
  const code = text.charCodeAt(0)
  if (code >= 0x0900 && code <= 0x097F) return text.includes('ला') || text.includes('ती') ? 'mr' : 'hi'
  if (code >= 0x0980 && code <= 0x09FF) return 'bn'
  if (code >= 0x0B80 && code <= 0x0BFF) return 'ta'
  if (code >= 0x0C00 && code <= 0x0C7F) return 'te'
  if (code >= 0x0C80 && code <= 0x0CFF) return 'kn'
  if (code >= 0x0D00 && code <= 0x0D7F) return 'ml'
  if (code >= 0x0A80 && code <= 0x0AFF) return 'gu'
  if (code >= 0x0A00 && code <= 0x0A7F) return 'pa'
  return 'en'
}

// ─── Emergency Detection ───────────────────────────────────────────────────────
const HARD_EMERGENCY = [
  /^help me$/i,
  /^bachao$/i,
  /^bachao mujhe$/i,
  /^madat karo$/i,
]

const SOFT_EMERGENCY = [
  /\b(help me|save me|sos|mayday)\b/i,
  /\b(bachao|madad|apadhan|sahayata|koMel|உதவி|సహాయం|ಸಹಾಯ|സഹായം)\b/i,
  /\b(i'm in danger|not safe|i am unsafe|in danger)\b/i,
  /\b(someone following|being followed|stalked|chasing)\b/i,
  /\b(chest pain|can't breathe|unconscious|not breathing|bleeding badly)\b/i,
  /\b(fire nearby|building fire|gas leak)\b/i,
  /\b(i'm scared|i am scared|i feel unsafe|i'm afraid)\b/i,
]

/**
 * @returns {{ isHard: boolean, isSoft: boolean }}
 *   isHard = direct SOS trigger
 *   isSoft = emergency-adjacent, respond carefully + show SOS button
 */
export function detectEmergency(text) {
  const t = text.trim()
  const isHard = HARD_EMERGENCY.some(p => p.test(t))
  const isSoft = !isHard && SOFT_EMERGENCY.some(p => p.test(t))
  return { isHard, isSoft }
}

// ─── Knowledge Base (English) ──────────────────────────────────────────────────
const KB = {
  greeting:
    `Hi there, traveller! I'm Momo, your Safety Guardian!\n\nI'm here to help you with:\n\n- Emergency guidance (floods, fires, earthquakes)\n- Emergency numbers (police, ambulance, fire)\n- Safe routes and safety scores\n- Emergency contacts\n- SOS and how to trigger an alert\n\nWhat can I help you with today?`,

  howAreYou:
    `I'm always alert and on duty for your safety!\n\nIs there anything I can help you with today — a safety question, emergency number, or route advice?`,

  emergency_soft:
    `I can hear that you're in a difficult situation. Please stay calm — I'm right here with you.\n\n- If you are in immediate danger, tap the SOS button below or shake your phone.\n- Call 112 (all-India emergency) right now.\n\nTell me what's happening and I'll guide you step by step.`,

  sos_info:
    `To trigger emergency SOS:\n\n- Press & hold the red SOS button on Home screen\n- Shake your phone firmly 3 times\n- Type "help me" here in chat\n\nOnce triggered:\n- Emergency contacts are notified instantly\n- Your GPS location is shared\n- An SMS is prepared and ready to send`,

  flood:
    `If you're in a flood situation:\n\n- Move to higher ground immediately\n- Never walk or drive through floodwater\n- Disconnect all electrical appliances\n- Take important documents and medicines\n- Call 1078 (NDMA Helpline)\n\nWater levels can rise very fast. Please move now if you're in a low-lying area!`,

  earthquake:
    `During an earthquake — DROP, COVER, HOLD ON:\n\n1. Drop to hands and knees immediately\n2. Take Cover under a sturdy table or desk\n3. Hold On until shaking stops\n4. Stay away from windows and exterior walls\n5. After shaking stops, check for injuries carefully\n\nNDMA Helpline: 1078`,

  fire:
    `If there's a fire nearby:\n\n- Exit immediately — don't use elevators\n- Alert others as you leave\n- Close doors behind you to slow the fire\n- Only use a fire extinguisher if the fire is very small\n- Call 101 (Fire Brigade) immediately\n\nNever go back inside once you've escaped!`,

  cyclone:
    `During a cyclone or severe storm:\n\n- Stay indoors and away from windows\n- Avoid trees, poles, and metal structures\n- Keep your phone fully charged\n- Do not drive during heavy storms\n- Monitor weather alerts constantly\n\nNDMA: 1078 | Disaster Management: 108`,

  medical:
    `For a medical emergency:\n\n- Call 108 (Ambulance) immediately\n- Locate the nearest hospital using the Hospital button below\n- If it's a heart attack: keep the person calm & seated\n- For bleeding: apply firm pressure with a cloth\n- For unconscious person: place in recovery position\n\nStay on the line with emergency services — they'll guide you!`,

  accident:
    `After a road accident:\n\n- Don't move injured people unless there's immediate danger\n- Call 108 (Ambulance) and 100 (Police)\n- Turn on hazard lights and set up a warning triangle\n- Document the scene if it's safe to do so\n- Move vehicles aside if possible to prevent further collisions\n\nYour safety comes first. Are you or anyone injured?`,

  hospital:
    `To find the nearest hospital:\n\n- Check the red markers on the Home map\n- Look at Nearby Safe Places in the bottom sheet\n- If SOS is active, the nearest hospital is shown automatically\n\nAmbulance: 108 (free, 24/7 across India)`,

  police:
    `To find the nearest police station:\n\n- Look for blue markers on the Home map\n- Check Nearby Safe Places in the bottom sheet\n\nPolice: 100 | National Emergency: 112\n\nFor non-urgent crime reports, you can also use the Report tab in the app.`,

  numbers:
    `Emergency numbers in India:\n\n- Police: 100\n- Ambulance: 108\n- Fire Brigade: 101\n- National Emergency: 112\n- Women Helpline: 1091\n- Child Helpline: 1098\n- NDMA Helpline: 1078\n- Cyber Crime: 1930\n\nSave these numbers right now — they could save your life!`,

  women_safety:
    `Women's safety tips:\n\n- Share your location with a trusted contact before going out\n- Keep your phone charged and SOS ready\n- Always verify cab details before getting in\n- Women Helpline: 1091 (free, 24/7)\n- Nirbhaya Fund Helpline: 181\n\nIn Safety Guardian, the shake-to-SOS feature is perfect for hands-free emergencies. Just shake your phone firmly!`,

  child_safety:
    `Child safety guidelines:\n\n- Child Helpline: 1098 (CHILDLINE)\n- Teach children the "Stranger Danger" rule\n- Keep emergency contacts saved and easy to access\n- Know your school's emergency protocols\n- Set up a "safe word" with your child for emergencies\n\nNever leave children unattended in public places.`,

  elder_safety:
    `Safety tips for elderly persons:\n\n- Elder Helpline: 14567 (ELDERLINE)\n- Keep emergency medicines easily accessible\n- Save SOS contact as 1st entry in phone book\n- Ensure non-slip mats and good lighting at home\n- Share daily check-in schedule with family\n\nIn Safety Guardian, adding a family member as an emergency contact ensures they get GPS updates if SOS is triggered.`,

  cyber_safety:
    `Cyber safety essentials:\n\n- Never share OTPs — no bank or government agency will ask\n- Avoid clicking links in unknown SMS or email\n- Cover your keypad when entering PIN at ATMs\n- Report cyber crime at cybercrime.gov.in or call 1930\n- If you've been scammed: call your bank immediately to freeze accounts`,

  scam_awareness:
    `Common scams in India to watch out for:\n\n- Fake courier scam — "your package is held, pay fine"\n- Lottery scam — "you've won, share details to claim"\n- Bank KYC scam — "your account will be frozen"\n- Fake officer scam — pretend to be police or CBI\n\nRule: Real authorities NEVER ask for money over the phone. Hang up and call 1930.`,

  first_aid:
    `Basic first aid reminders:\n\n- Bleeding: Apply firm pressure for 10+ minutes\n- CPR: 30 compressions + 2 rescue breaths (if trained)\n- Burns: Cool with running water for 10 mins, never butter\n- Snakebite: Keep person still, immobilize the limb, go to hospital immediately\n- Poisoning: Call 1066 (Poison Control) immediately\n\nTake a first-aid course — it can save a life!`,

  travel_safety:
    `Safe travel tips:\n\n- Share your route and ETA with someone before travelling\n- Verify cab plate number with the app before boarding\n- Avoid isolated areas especially at night\n- Keep phone charged; carry a power bank\n- Keep a digital copy of important documents\n\nUse Safety Guardian's route safety scores to choose the safest path!`,

  route:
    `Route safety scores explained:\n\n- 80–100: Safe Zone — proceed normally\n- 60–79: Moderate — stay alert, drive carefully\n- Below 60: High Risk — consider an alternative route\n\nScores are based on:\n- Community hazard reports\n- Proximity to hospitals & police\n- Flood and crime zone data\n- Real-time traffic conditions\n\nTap any route card in the Journey tab to see the full breakdown!`,

  contacts:
    `To add emergency contacts:\n\n1. Go to the Profile tab (bottom right)\n2. Scroll to Emergency Contacts\n3. Tap ADD and enter name + phone number\n4. Or use Import from Phone for instant setup\n\nThey receive your live GPS location the moment SOS is triggered. Add at least 2 contacts!`,

  navigation:
    `To start safe navigation:\n\n1. Tap the Journey tab or use the search bar on Home\n2. Type or speak your destination\n3. Choose between Safest, Balanced, or Fastest\n4. Tap Start Journey\n\nYou'll get turn-by-turn instructions with live hazard warnings along your route!`,

  report:
    `To report a hazard:\n\n1. Tap the Reports tab in the bottom navigation\n2. Pin the exact location on the map\n3. Select hazard type (flood, fire, crime, road damage, etc.)\n4. Add a description and tap Submit\n\nYour report helps the entire community! Verified reports update safety scores in real-time.`,

  weather:
    `Weather is shown on the Home screen — look for the weather card at the top.\n\nWeather affects route safety:\n- Heavy rain -> waterlogging risk\n- Storms -> avoid travel if possible\n- Extreme heat -> stay hydrated, avoid open areas\n\nThese alerts appear in the Area Alerts section on Home!`,

  heatwave:
    `During a heatwave:\n\n- Stay indoors between 12 PM – 3 PM\n- Drink at least 3 litres of water daily\n- Wear loose, light-coloured clothing\n- Keep curtains/blinds closed during peak heat\n- Use ORS (oral rehydration solution) if feeling dizzy\n\nHeatstroke signs: No sweating + very high body temperature -> call 108!`,

  harassment:
    `If you're being harassed or followed:\n\n- Enter a well-lit public space immediately (shop, petrol pump)\n- Pretend to call someone — say your location aloud\n- Shake your phone to trigger SOS discreetly\n- Call 100 (Police) if the situation escalates\n- Women can call 1091 (Women Helpline) for immediate response\n\nYou are not alone. I'm right here with you!`,

  safe_zone:
    `Safe havens near you are marked as green shields on the Home map.\n\nThese include:\n- Hospitals\n- Police stations\n- 24/7 Petrol pumps\n- 24/7 Pharmacies\n- Verified community safe spots\n\nIf you feel unsafe, navigate to the nearest green marker!`,

  default:
    `Hmm, I'm not sure about that one!\n\nBut here's what I can help with:\n\n- Emergency procedures and first aid\n- Emergency helpline numbers\n- Route safety and navigation\n- Flood, fire, earthquake advice\n- Women's safety and anti-harassment\n- Cyber safety and scam awareness\n- How to use SOS\n\nJust ask me anything!`,
}

// ─── Hindi Knowledge Base (partial) ─────────────────────
const KB_HI = {
  greeting: `नमस्ते! मैं Momo हूँ, आपका Safety Guardian!\n\nमैं इन विषयों में आपकी मदद कर सकता हूँ:\n\n- आपातकालीन मार्गदर्शन — बाढ़, आग, भूकंप\n- आपातकालीन नंबर — पुलिस, एम्बुलेंस, दमकल\n- सुरक्षित रास्ते — सेफ्टी स्कोर कैसे काम करते हैं\n- SOS — अलर्ट कैसे ट्रिगर करें\n\nआज मैं आपकी क्या मदद करूँ?`,
  emergency_soft: `मैं समझ सकता हूँ कि आप मुश्किल स्थिति में हैं। शांत रहें — मैं यहाँ हूँ।\n\n- अगर आप तुरंत खतरे में हैं, नीचे SOS बटन दबाएं या फोन हिलाएं।\n- 112 पर कॉल करें अभी।\n\nमुझे बताएं क्या हो रहा है — मैं कदम-कदम पर आपका मार्गदर्शन करूँगा।`,
  numbers: `भारत में आपातकालीन नंबर:\n\n- पुलिस: 100\n- एम्बुलेंस: 108\n- दमकल: 101\n- राष्ट्रीय आपातकाल: 112\n- महिला हेल्पलाइन: 1091\n- बाल हेल्पलाइन: 1098\n- NDMA: 1078\n- साइबर क्राइम: 1930`,
  flood: `बाढ़ की स्थिति में:\n\n- तुरंत ऊँची जगह पर जाएं\n- कभी भी बाढ़ के पानी में न चलें या गाड़ी न चलाएं\n- सभी बिजली के उपकरण बंद करें\n- NDMA हेल्पलाइन: 1078 पर कॉल करें\n\nपानी बहुत तेजी से बढ़ सकता है। अभी सुरक्षित स्थान पर जाएं!`,
  default: `माफ़ करें, मुझे वह समझ नहीं आया। मैं आपातकालीन स्थितियों, रास्तों और फर्स्ट एड में आपकी मदद कर सकता हूँ!`
}

const KB_BN = {
  greeting: `নমস্কার! আমি Momo, আপনার Safety Guardian!\n\nআমি আপনাকে সাহায্য করতে পারি:\n\n- জরুরি নির্দেশনা (বন্যা, আগুন, ভূমিকম্প)\n- জরুরি নম্বর (পুলিশ, অ্যাম্বুলেন্স, ফায়ার)\n- নিরাপদ রুট\n- SOS অ্যালার্ট\n\nআজ আমি আপনাকে কীভাবে সাহায্য করতে পারি?`,
  emergency_soft: `আমি বুঝতে পারছি আপনি বিপদে আছেন। শান্ত থাকুন — আমি আপনার সাথেই আছি।\n\n- যদি আপনি তাৎক্ষণিক বিপদে থাকেন, নিচে SOS বোতাম টিপুন।\n- এখনই 112 এ কল করুন।\n\nকী হচ্ছে আমাকে বলুন।`,
  default: `দুঃখিত, আমি বুঝতে পারিনি। আমি জরুরি অবস্থা এবং নিরাপত্তায় সাহায্য করতে পারি!`
}

const KB_TA = {
  greeting: `வணக்கம்! நான் Momo, உங்கள் பாதுகாப்பு வழிகாட்டி!\n\nஅவசர கால எண்கள், பாதுகாப்பான வழிகள் மற்றும் SOS குறித்து நான் உங்களுக்கு உதவ முடியும். இன்று நான் உங்களுக்கு எப்படி உதவ முடியும்?`,
  emergency_soft: `நீங்கள் ஆபத்தில் உள்ளீர்கள் என்பதை என்னால் உணர முடிகிறது. அமைதியாக இருங்கள்.\n\n- உடனடியாக கீழே உள்ள SOS பொத்தானை அழுத்தவும்.\n- 112 ஐ அழைக்கவும்.`,
  default: `மன்னிக்கவும், எனக்கு புரியவில்லை. அவசரகால பாதுகாப்பு குறித்து கேளுங்கள்.`
}

const KB_TE = {
  greeting: `నమస్కారం! నేను Momo, మీ Safety Guardian!\n\nఅత్యవసర పరిస్థితులు, సురక్షితమైన మార్గాలు మరియు SOS గురించి నేను మీకు సహాయం చేయగలను. ఈరోజు నేను మీకు ఎలా సహాయం చేయగలను?`,
  emergency_soft: `మీరు ఆపదలో ఉన్నారని నేను అర్థం చేసుకోగలను. దయచేసి ప్రశాంతంగా ఉండండి.\n\n- వెంటనే SOS బటన్ నొక్కండి.\n- 112 కి కాల్ చేయండి.`,
  default: `క్షమించండి, నాకు అర్థం కాలేదు. అత్యవసర భద్రత గురించి అడగండి.`
}

const KB_MR = {
  greeting: `नमस्कार! मी Momo, तुमचा Safety Guardian आहे!\n\nमी तुम्हाला आपत्कालीन मदत, सुरक्षित मार्ग आणि SOS मध्ये मदत करू शकतो. आज मी तुमची कशी मदत करू?`,
  emergency_soft: `मला समजते की तुम्ही संकटात आहात. शांत रहा — मी तुमच्या सोबत आहे.\n\n- त्वरित SOS बटण दाबा.\n- 112 वर कॉल करा.`,
  default: `क्षमस्व, मला समजले नाही. कृपया सुरक्षिततेबद्दल विचारा.`
}

// ─── Main Response Engine ──────────────────────────────────────────────────────
/**
 * @param {string} text         User's message
 * @param {string} lang         Language code ('en', 'hi', etc.)
 * @param {Array}  history      Last 6 message objects for context
 * @returns {string}
 */
export function getBotReply(text, lang = 'en', history = []) {
  const t = text.toLowerCase().trim()
  
  let kb = KB;
  if (lang === 'hi') kb = { ...KB, ...KB_HI }
  else if (lang === 'bn') kb = { ...KB, ...KB_BN }
  else if (lang === 'ta') kb = { ...KB, ...KB_TA }
  else if (lang === 'te') kb = { ...KB, ...KB_TE }
  else if (lang === 'mr') kb = { ...KB, ...KB_MR }

  // Context awareness: check last 3 bot messages for topic continuity
  const recentTopics = history
    .filter(m => m.sender === 'bot')
    .slice(-3)
    .map(m => m.text.toLowerCase())

  const personMentioned = history.slice(-6).some(m => m.sender === 'user' &&
    /\b(sister|brother|mother|father|friend|she|he|they|family|wife|husband|maa|bhai|papa|didi)\b/i.test(m.text))

  // Follow-up pronouns
  if (/\b(is she|is he|are they|is she safe|is he safe|did she|did he)\b/i.test(t) && personMentioned) {
    return `Based on what you mentioned, I'd recommend:\n\n- Share their live location — ask them to turn on Location Sharing\n- Call them directly to check in\n- If no response in 15 minutes, trigger SOS on their behalf\n\nIs there anything specific you're worried about?`
  }

  // Greetings
  if (/^(hi|hello|hey|howdy|good morning|good afternoon|good evening|namaste|namaskar|hola|jai hind)\b/.test(t)) return kb.greeting
  if (/how are you|how r u|what'?s up|whats up|kaisa ho|kya haal|kaisi ho/.test(t)) return kb.howAreYou

  // Emergency
  if (/^(help|save|sos|bachao|madat|madad|koMel)$/i.test(t.trim())) return kb.emergency_soft || KB.emergency_soft
  if (/scared|afraid|unsafe|in danger|someone following|being followed|stalked|chasing/.test(t)) return kb.harassment || KB.harassment

  // Disasters
  if (/flood|waterlog|baarish|paani|barh/.test(t)) return kb.flood
  if (/earthquake|quake|bhukamp/.test(t)) return KB.earthquake
  if (/\bfire\b|gas leak|aag|dhamaka/.test(t)) return KB.fire
  if (/cyclone|storm|toofan|thunder|typhoon/.test(t)) return KB.cyclone
  if (/heatwave|heat wave|garmi|lu /.test(t)) return KB.heatwave

  // Medical
  if (/hospital|ambulance|medical|accident|road accident|crash|injury|hurt|bleeding|unconscious|chest pain|can't breathe/.test(t)) {
    if (/accident|crash|collision/.test(t)) return KB.accident
    if (/hospital/.test(t)) return KB.hospital
    if (/first.?aid|cpr|treatment/.test(t)) return KB.first_aid
    return KB.medical
  }

  // Safety topics
  if (/women|woman|girl|female|ladies|mahila|lady/.test(t)) return KB.women_safety
  if (/child|kid|children|baby|minor|baccha|bachcha/.test(t)) return KB.child_safety
  if (/elder|senior|old age|elderly|budhapa/.test(t)) return KB.elder_safety
  if (/harassment|harass|molestation|eve.?tease|follow/.test(t)) return KB.harassment
  if (/cyber|online fraud|otp|phishing|scam|fraud|cheat/.test(t)) return kb.cyber_safety || KB.cyber_safety
  if (/scam|lottery|fake call|impersonation/.test(t)) return KB.scam_awareness
  if (/first.?aid|cpr|bleeding|burn|snakebite|poison/.test(t)) return KB.first_aid
  if (/travel|trip|journey|cab|auto|bus|train|night travel/.test(t)) return KB.travel_safety
  if (/weather|rain|heat|temperature/.test(t)) return KB.weather

  // App features
  if (/police|cop|station|thana/.test(t)) return kb.police || KB.police
  if (/sos|shake|trigger|emergency alert/.test(t)) return KB.sos_info
  if (/contact|family|emergency contact|add contact/.test(t)) return KB.contacts
  if (/report|hazard|submit/.test(t)) return KB.report
  if (/route|safest route|safe path/.test(t)) return KB.route
  if (/navigate|navigation|direction|turn/.test(t)) return KB.navigation
  if (/score|safety score|safe zone/.test(t)) return KB.safe_zone
  if (/number|helpline|hotline|call/.test(t)) return kb.numbers || KB.numbers

  return kb.default || KB.default
}

// ─── Quick Action Generator ────────────────────────────────────────────────────
/**
 * Returns relevant quick action buttons based on the bot's reply.
 * @param {string} replyText
 * @param {boolean} isSoftEmergency
 * @returns {Array<{ label: string, action: string }>}
 */
export function getQuickActions(replyText, isSoftEmergency = false) {
  const t = replyText.toLowerCase()
  const actions = []

  if (isSoftEmergency || t.includes('sos') || t.includes('in danger') || t.includes('trigger')) {
    actions.push({ label: 'Trigger SOS', action: 'SOS' })
  }
  if (t.includes('hospital') || t.includes('ambulance') || t.includes('108')) {
    actions.push({ label: 'Find Hospital', action: 'HOSPITAL' })
  }
  if (t.includes('police') || t.includes('100') || t.includes('station') || t.includes('thana')) {
    actions.push({ label: 'Find Police', action: 'POLICE' })
  }
  if (t.includes('route') || t.includes('safest') || t.includes('navigate')) {
    actions.push({ label: 'Safe Route', action: 'ROUTE' })
  }
  if (t.includes('contact') || t.includes('emergency contact')) {
    actions.push({ label: 'Add Contact', action: 'CONTACTS' })
  }
  if (t.includes('report') || t.includes('hazard')) {
    actions.push({ label: 'Report Hazard', action: 'REPORT' })
  }

  return actions.slice(0, 3) // max 3 actions
}
