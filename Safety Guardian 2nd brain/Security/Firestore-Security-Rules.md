# 📜 Firestore Security Rules (`firestore.rules`)

Safety Guardian enforces strict document-level role and owner verification.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // User profile documents — users can only read/write their own profile
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      // Nested subcollections (e.g. medical profile, contacts)
      match /{allSubcollections=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }

    // Community safety reports — any authenticated user can read; creators manage own
    match /reports/{reportId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
      allow update, delete: if request.auth != null && resource.data.userId == request.auth.uid;
    }

    // SOS events — authenticated users can create their own; read own
    match /sos_events/{sosId} {
      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
      allow read: if request.auth != null && (resource.data.userId == request.auth.uid || request.auth.token.admin == true);
      allow update: if false; // Only Cloud Functions can update SOS status
    }
  }
}
```
