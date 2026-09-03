# 🔄 Workflow: Community Incident Reporting

1. **Pin Location**: User picks hazard coordinate via [[LocationPicker]].
2. **Categorization**: User selects hazard category and severity in [[HazardCategoryPicker]].
3. **Firestore Commit**: [[reportService-Service]] writes to `reports` collection.
4. **Live Broadcast**: Active navigation routes dynamically re-score if incident intersects within $250\text{m}$.
