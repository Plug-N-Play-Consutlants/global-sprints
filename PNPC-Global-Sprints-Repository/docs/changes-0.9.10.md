# v0.9.10 — Final UX and meeting-time corrections

- Preserves opt-in Microsoft People.Read recipient suggestions preference per connected Microsoft account; silently resumes when consent/token is available. No Graph mailbox permissions added.
- Connected button becomes Remove Permissions, disabling local suggestions and removing preference. Microsoft consent must be revoked separately through Microsoft account/tenant administration; no false promise of remote grant revocation.
- Save Ceremony primary action uses existing green CTA class.
- Native minute-precision time inputs for planning and ceremonies support e.g. 03:10 PM, with suggested quarter-hour values where browser datalist is supported.
- Existing local-time roundtrip check is retained; saving dated local ceremony records now also checks invalid/nonexistent dates/times. Browser timezone determines local time; tests must use the corresponding OS timezone.
- Product Command v0.5.17 unchanged: subscription lookup/cancellation not implemented until verified WP Swings contract. Licensing integration v0.9.9 preserved.
