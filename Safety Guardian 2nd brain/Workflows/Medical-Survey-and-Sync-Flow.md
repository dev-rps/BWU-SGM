# 🔄 Workflow: Medical Survey & Emergency Sync

1. **User Survey**: User completes multi-step medical questionnaire in [[ProfilePage]].
2. **Persistence**: [[medicalService-Service]] writes to `users/{uid}/medical/profile` and `localStorage`.
3. **Environmental Personalization**: Respiratory/cardiac conditions automatically inflate AQI walking penalties in [[environmentalService-Service]].
