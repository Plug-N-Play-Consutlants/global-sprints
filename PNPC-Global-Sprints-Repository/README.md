# PNPC Global Sprints

Native Azure DevOps extension for independently managed Global Sprints across one or multiple projects.

**Accepted runtime baseline:** v0.7.2. **Current development target:** v0.8.0 Production Hardening and Commercial Readiness. The repository may contain in-progress hardening changes that are **not** an accepted or published release.

## Repository

- `extension/`: Azure DevOps extension assets, application, manifest and bundled vendor scripts.
- `scripts/validate.py`: narrow static manifest and authentication checks.
- `scripts/audit_paths.py`: source-path checks.
- `scripts/package.py`: creates a VSIX from the extension assets; packaging alone does not constitute release acceptance.
- `docs/`: historical audits, change logs and current readiness tracking.

Run `python scripts/validate.py` and `python scripts/audit_paths.py` to check basic invariants. Additional security, multi-user, integration and upgrade testing is required before v0.8 acceptance.

## Version policy

Keep historical release notes and audit artifacts under their original versions. Do not bump shipping manifests to 0.8.0 until the release has passed its acceptance gates. Source ZIP archives must contain the exact top-level folder `PNPC-Global-Sprints-Repository`.

See `docs/production-readiness.md` for the active v0.8 workstream and `docs/build-history.md` for historical milestones.
