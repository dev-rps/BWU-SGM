# ☁️ Firebase Cloud Functions Gateway (`functions/index.js`)

The `functions/index.js` script runs on Google Cloud Functions in the **`asia-south1` (Mumbai)** region to achieve lowest possible latency ($<100\text{ms}$) across India.

---

## 🔒 Concurrency & Idempotency: Atomic Locking

To prevent duplicate SMS or voice calls if multiple backend instances wake simultaneously, the function executes an atomic Firestore transaction:

```javascript
await db.runTransaction(async (tx) => {
  const doc = await tx.get(ref)
  if (doc.data().status !== 'pending') {
    throw new Error('Already being processed by another gateway')
  }
  tx.update(ref, {
    status:      'processing',
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
    gatewayId:   'cloud-function',
  })
})
```

---

## 🎙️ Automated TwiML Voice Call Script

When calling the primary emergency contact, Twilio synthesizes speech in an Indian-accented voice (`en-IN`):

```xml
<Response>
  <Say voice="alice" language="en-IN">
    Emergency Alert from Safety Guardian.
    Rohan Sharma has triggered an SOS emergency.
    Please contact them immediately.
  </Say>
  <Pause length="1"/>
  <Say voice="alice" language="en-IN">Repeating. Emergency Alert from Safety Guardian.</Say>
</Response>
```
