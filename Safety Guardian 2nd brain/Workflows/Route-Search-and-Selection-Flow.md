# 🔄 Workflow: Route Search & Selection

1. **User Query**: User enters text or speaks destination in [[SearchPage]].
2. **Geocoding**: [[nominatim-Service]] queries TomTom Search API.
3. **Route Computation**: [[tomtomRouting-Service]] queries Google Routes v2 $\rightarrow$ TomTom $\rightarrow$ OSRM.
4. **Safety Evaluation**: [[safetyScore-Service]] computes hazard penalties across polylines.
5. **Display**: [[RouteSelectionPage]] renders 3-state sheet with route rankings.
