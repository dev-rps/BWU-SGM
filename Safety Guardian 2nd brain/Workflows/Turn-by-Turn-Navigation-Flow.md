# 🔄 Workflow: Turn-by-Turn Navigation

1. **GPS Tracking**: [[NavigationPage]] initializes `navigator.geolocation.watchPosition`.
2. **Proximity Checks**: When distance to current step maneuver is $<20\text{m}$, UI advances to next step.
3. **Rerouting**: If off-route distance $>50\text{m}$, triggers [[tomtomRouting-Service|getReroutedRoute]].
4. **Arrival**: When distance to destination $<50\text{m}$ on last step, auto-navigates to [[JourneyReviewPage]].
