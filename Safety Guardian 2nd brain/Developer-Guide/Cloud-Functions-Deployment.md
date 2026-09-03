# ☁️ Deploying Cloud Functions

```bash
# 1. Login to Firebase
firebase login

# 2. Configure Twilio credentials
firebase functions:config:set twilio.account_sid="ACxxx" twilio.auth_token="xxx" twilio.from_number="+917797822568"

# 3. Deploy functions to asia-south1
firebase deploy --only functions
```
