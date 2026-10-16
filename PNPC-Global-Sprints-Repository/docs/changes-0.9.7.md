# 0.9.7 — Relevant people recipient suggestions

- Replace saved-contacts-only lookup with Microsoft Graph `/me/people` relevance-ranked suggestions from communication history, contacts, and directory.
- Explicit optional `People.Read` consent; no `Mail.Read` or mailbox content access.
- Preserve manually entered external recipients, multiple recipient entry, and all calendar booking pathways.
- Microsoft Search person endpoint remains a future option only if broader permissions are justified.
- Live Microsoft 365 consent and returned people coverage require user testing.
