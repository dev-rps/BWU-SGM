# 🤖 Momo AI Assistant Brain (`momoAI.js`)

**Momo** is Safety Guardian's offline-first, zero-latency safety companion. It operates 100% on the client device without sending private conversation logs to external cloud servers.

---

## 🧠 Capabilities & Architecture

```mermaid
flowchart TD
    UserInput["User Message Text"] --> DetectLang["detectLanguage(text): Script Range Detector"]
    DetectLang --> DetectEmerg["detectEmergency(text): Hard vs Soft Classifier"]
    
    DetectEmerg -->|Hard Emergency: 'Help me' / 'Bachao'| DirectSOS["Trigger Instant SOS Action"]
    DetectEmerg -->|Soft Emergency / Question| KnowledgeEngine["getBotReply(text, lang, history)"]

    KnowledgeEngine --> KB_Lookup["Multilingual Knowledge Base (30+ Safety Topics)"]
    KB_Lookup --> Actions["getQuickActions(replyText): Generate Action Pills"]
    Actions --> Render["Render Chat Bubble + Dynamic Action Buttons"]
```

---

## 🛡️ Emergency Intent Classification
- **Hard Emergency** (`isHard`): Regex patterns like `/^help me$/i`, `/^bachao$/i`. Directly prompts immediate SOS activation.
- **Soft Emergency** (`isSoft`): Regex patterns like `/being followed/`, `/chest pain/`, `/gas leak/`. Provides calming step-by-step guidance and presents a floating SOS shortcut.
