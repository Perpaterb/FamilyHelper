# Development Guide

## Branch Workflow

**CRITICAL: All changes go through branches. Never push directly to main.**

```
1. Create branch    → git checkout -b feature/short-description
2. Make changes     → Code, test locally
3. Run tests        → npm test (in backend/ AND web-admin/)
4. Commit           → git commit with conventional commits
5. Push branch      → git push -u origin feature/short-description
6. STOP             → Tell user branch is ready for testing
7. Wait for user    → User tests the changes
8. Merge to main    → Only after user approval
9. CI/CD deploys    → GitHub Actions handles deployment automatically
```

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation only

### Commit Messages

Use conventional commits:
```
feat: Add new calendar feature
fix: Resolve login issue on Android
docs: Update architecture documentation
refactor: Simplify auth flow
```

## Testing

### Run Tests Before Every Commit

```bash
# Backend tests
cd backend && npm test

# Web admin tests
cd web-admin && npm test
```

**Tests MUST pass before committing.**

### What to Test

- New features: Add tests for new functionality
- Bug fixes: Add test that would have caught the bug
- API changes: Update API tests

## CI/CD Pipeline

GitHub Actions (`.github/workflows/ci-cd.yml`) runs automatically on push to main:

1. **Test** - Runs backend and web-admin tests
2. **Build** - Builds web-admin static files
3. **Deploy** - Rsync to Lightsail, restart PM2

**Never deploy manually.** Let CI/CD handle it.

## Local Development

### Start Everything (Docker)

```bash
# Build web-admin first
cd web-admin && npm run build

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f api
```

Access:
- Web app: http://localhost
- API: http://localhost:3000
- Email UI: http://localhost:8025

### Mobile Development

```bash
cd mobile-main
npm start  # Starts Expo
```

Scan QR code with Expo Go app.

### Database

```bash
# Run migrations (local)
cd backend
npx prisma migrate dev

# View database
docker-compose --profile tools up -d  # Starts pgAdmin
# Access: http://localhost:5050
```

## Code Structure

```
/backend           Express API
  /controllers     Route handlers
  /services        Business logic
  /middleware      Auth, validation
  /prisma          Database schema

/web-admin         React web app
  /src/screens     Web-only screens
  (imports from mobile-main for shared screens)

/mobile-main       React Native app
  /src/screens     All app screens (shared with web-admin)
  /src/components  Reusable components
  /src/services    API client, auth
```

### File Size Limits

- Files: Max 500 lines
- React components: Max 300 lines
- Controllers: Max 200 lines (extract to services)

## Changing API Endpoints

**Before changing ANY endpoint:**

1. Run `backend/scripts/check-endpoint-usage.sh "/endpoint/path"`
2. Update `backend/API.md` first
3. Make the change
4. Update tests
5. Check all 3 apps (web-admin, mobile-main, mobile-messenger)

## Common Tasks

### Add a new screen

1. Create screen in `mobile-main/src/screens/`
2. Add to navigation in `mobile-main/src/navigation/AppNavigator.jsx`
3. For web: Import in `web-admin/App.js`

### Add a new API endpoint

1. Add route in `backend/routes/`
2. Add controller in `backend/controllers/`
3. Add to `backend/API.md`
4. Add tests

### Update database schema

1. Edit `backend/prisma/schema.prisma`
2. Run `npx prisma migrate dev --name description`
3. Update any affected code
4. Test locally
5. After merge, CI/CD runs `npx prisma migrate deploy` in production

### Release Mobile App Update

When releasing a new mobile app version:

1. Update version in `mobile-main/app.json` and `mobile-main/android/app/build.gradle`
2. Build the Android package (`.aab`)
3. Upload to Google Play Console
4. **Update the website updates page** at https://familyhelperapp.com/updates
   - Update "Current Version" (e.g., 1.0.87)
   - Update "Last Updated" date
   - Add release notes if significant changes

**IMPORTANT:** The /updates page must always reflect the latest released version.
