# 📞 Twilio Telephony Pipeline

The telephony pipeline sends emergency dispatches via Twilio's Programmable Messaging and Voice APIs.

---

## ⚙️ Required Backend Configuration
Configured in Firebase environment configuration:
```bash
firebase functions:config:set twilio.account_sid="ACxxxxxxxx" twilio.auth_token="xxxxxxxx" twilio.from_number="+917797822568"
```

---

## 📱 SMS Dispatch Format
```text
🚨 SAFETY GUARDIAN ALERT

Rohan Sharma has triggered an SOS emergency.

📍 Live Location:
https://maps.google.com/?q=22.572645,88.363892

⏰ Time: 29/08/2026, 3:30:00 pm
🆘 Type: MEDICAL

Please contact them immediately or go to their location.

— Safety Guardian Emergency System
  +91 7797822568
```
