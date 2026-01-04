# Project Status

**Last Updated:** 2025-01-04

## Overview

Family Helper is a **working production app** with 2 products live:
- **Web Admin** (familyhelperapp.com) - React web app with full features
- **Family Helper Mobile** (mobile-main) - React Native app
- **FH Messenger** (mobile-messenger) - NOT IN MVP1 - Future messaging-only app

## Current State: Production Live + App Store Submissions

### Web App
- **Status:** Live at https://familyhelperapp.com
- **Version:** 1.0.100

### Android App
- **Status:** In closed testing (Google Play)
- **Version:** 1.0.100 (versionCode 40)
- **Requirement:** Need 12 testers for 14 days before public release
- **Bundle:** `mobile-main/releases/family-helper-1.0.100-40.aab`

### iOS App
- **Status:** Submitted for App Store review
- **Version:** 1.0.100 (build 40)
- **Review:** Pending (typically 24-48 hours)

## App Features

Users can:
- Create/manage family groups with role-based permissions
- Send encrypted messages with read receipts and mentions
- Make voice/video calls with optional recording
- Manage shared calendars and events
- Track shared expenses and balances
- Create gift/item registries with sharing
- Run Secret Santa gift exchanges
- Store documents and create wiki pages
- View complete audit logs for court compliance
- Export audit reports for legal documentation

## Recent Changes (January 2025)

| Date | Change |
|------|--------|
| Jan 4 | Submitted iOS app to App Store |
| Jan 4 | Added "Coming Soon" to landing page store buttons |
| Jan 4 | Fixed registry link display (plain text + copy button) |
| Jan 4 | Added bill section to mobile MyAccountScreen |
| Jan 4 | Fixed mobile tests (SafeAreaProvider wrapper) |
| Jan 4 | Updated app icons |
| Jan 3 | Added iOS encryption compliance config |
| Jan 3 | Fixed Android navigation bar button overlap (SafeAreaFAB) |
| Jan 2 | Fixed expired users getting admin access via trial logic |

## Known Issues

### High Priority
None currently.

### Medium Priority
| Issue | Description | Status |
|-------|-------------|--------|
| Play Store icon | Icon uploaded separately in Play Console (not from APK) | Manual upload needed |

### Low Priority
None currently.

## App Store Metadata

### Google Play
- **Package:** com.familyhelper.app
- **Link:** https://play.google.com/store/apps/details?id=com.familyhelper.app
- **Status:** Closed testing

### Apple App Store
- **Bundle ID:** com.familyhelper.app
- **Status:** Awaiting review

### Store Description Summary
```
Co-parenting made simple. Fully audited for court compliance.
Secure messaging, shared calendars, expense tracking - all in one private, ad-free app.
```

## Test Status

| Project | Tests | Status |
|---------|-------|--------|
| mobile-main | 78 | Passing |
| backend | 110 | Passing |
| web-admin | 168 | Passing |
| **Total** | **356** | **All passing** |

## Version History

| Version | Build | Date | Notes |
|---------|-------|------|-------|
| 1.0.101 | 41 | Jan 4, 2025 | Icon update (larger graphics) |
| 1.0.100 | 40 | Jan 4, 2025 | App Store submissions |
| 1.0.912 | 39 | Jan 3, 2025 | Bill section, SafeAreaFAB |
| 1.0.911 | 38 | Jan 3, 2025 | Navigation bar fixes |

## Documentation

| Doc | Purpose |
|-----|---------|
| `docs/ARCHITECTURE.md` | System architecture |
| `docs/DEVELOPMENT.md` | Development setup and workflows |
| `docs/ICON_UPDATE.md` | How to update app icons |
| `backend/API.md` | API reference |
| `CLAUDE.md` | Claude Code instructions |

## What's Next

1. **Get 12 Android testers** - Required for Google Play public release
2. **iOS App Store approval** - Awaiting review
3. **Public release** - After testing requirements met

## Future Features

| Feature | Description | Priority |
|---------|-------------|----------|
| Independent Deployments | Update web app, mobile apps, and /updates page without backend downtime | Medium |
| Calendar Import/Export | Import from Google/Apple/Outlook, export to other apps | Medium |
| Group Photo Albums | Shared photo albums within groups | Low |

---

**Note:** Keep this file concise. For detailed history, see git log.
