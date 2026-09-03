# 🔄 Workflow: SOS Emergency Dispatch

1. **Trigger**: User shakes phone 3 times or holds [[SOSButton]].
2. **Document Creation**: [[sosService-Service]] writes to Firestore `sos_events`.
3. **Cloud Processing**: [[Cloud-Functions-Gateway|processSOSEvent]] acquires lock.
4. **Telephony Dispatch**: Twilio sends SMS to all contacts and calls primary contact with TwiML voice.
5. **Real-time Confirmation**: Client UI updates with delivery receipts.
