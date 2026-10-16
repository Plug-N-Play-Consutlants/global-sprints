# v0.6.3 audit extension

- Read-only GET for source work-item hierarchy parent links. PASS indicates readable, non-conflicting parent links at audit time; it does not prove future transition integrity.
- Fresh ADO GET compares live source states with loaded local state; WARNING when local values differ. No writes or forced refresh.
- Explicit NOT_TESTED remains for process ancestry, true external mutation/refresh roundtrip, Outlook invitation delivery, and insufficient distinct observation days.
- Planning meeting time selectors now use familiar 12-hour AM/PM dropdowns at 15-minute intervals; values remain canonical HH:mm. Existing non-quarter-hour values are preserved as custom options.
- Static checks do not replace ADO runtime acceptance.
