# App Icon Update Guide

**Last Updated:** 2025-01-04

## Icon Files Location

All source icon files are in `mobile-main/assets/`:

| File | Size | Purpose |
|------|------|---------|
| `icon.png` | 1024x1024 | iOS App Store icon, iOS home screen |
| `adaptive-icon.png` | 1024x1024 | Android adaptive icon (foreground layer) |
| `splash-icon.png` | 1024x1024 | Splash screen logo |
| `notification-icon.png` | 96x96 | Push notification icon (should be white on transparent) |
| `favicon.png` | 48x48 | Web favicon |

## Configuration

Icons are configured in `mobile-main/app.json`:

```json
{
  "expo": {
    "icon": "./assets/icon.png",
    "splash": {
      "image": "./assets/splash-icon.png"
    },
    "ios": {
      "bundleIdentifier": "com.familyhelper.app"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      }
    },
    "plugins": [
      ["expo-notifications", {
        "icon": "./assets/notification-icon.png"
      }]
    ]
  }
}
```

## Icon Design Guidelines

### General
- Icon graphic should fill **80-85%** of the canvas
- Avoid excessive padding/whitespace around the graphic
- Use PNG format with transparency where appropriate

### iOS
- 1024x1024px required for App Store
- No transparency (Apple fills with white)
- No rounded corners (iOS applies automatically)

### Android Adaptive Icons
- Foreground: 1024x1024px with transparency
- Safe zone: Center 66% (a circle) - keep important content here
- Android masks the icon in various shapes (circle, squircle, etc.)

## How to Update Icons

### Step 1: Replace Source Files
Replace the PNG files in `mobile-main/assets/`:
- `icon.png` - Main app icon
- `adaptive-icon.png` - Android foreground

### Step 2: Clear Generated Caches

**Android generated icons are cached in:**
- `mobile-main/android/app/src/main/res/mipmap-*/` (ic_launcher*.webp)
- `mobile-main/android/app/build/` (build cache)

**iOS generated icons are cached in:**
- `mobile-main/ios/FamilyHelper/Images.xcassets/AppIcon.appiconset/`

**To regenerate, run:**
```bash
cd mobile-main

# Clean and regenerate native projects
npx expo prebuild --clean

# Or just clean Android build cache
cd android && ./gradlew clean && cd ..
```

### Step 3: Rebuild the App

**For local Android build:**
```bash
cd mobile-main/android
KEYSTORE_PASSWORD='your-password' KEY_PASSWORD='your-password' ./gradlew bundleRelease
```

**For EAS cloud build (recommended):**
```bash
cd mobile-main
npx eas build --platform android --profile production
npx eas build --platform ios --profile production
```

EAS builds always start fresh, so cached icons are not an issue.

### Step 4: Update Store Listings

After updating icons, you also need to update:

**Google Play Console:**
- App icon (512x512) - uploaded separately in Store Listing
- Feature graphic (1024x500) if it contains the icon

**App Store Connect:**
- App icon is included in the IPA build
- No separate upload needed

## Troubleshooting

### Icon not updating on device
1. Uninstall the app completely
2. Clear build cache: `cd android && ./gradlew clean`
3. Run `npx expo prebuild --clean`
4. Rebuild

### Icon looks small/has too much padding
- The graphic inside the icon needs to fill more of the canvas
- Aim for 80-85% fill, not 60%

### Android icon looks different in different launchers
- This is normal - Android adaptive icons are masked differently
- Ensure important content is in the center 66% safe zone

### Play Store showing old icon
- The Play Store icon is uploaded separately in Google Play Console
- Update it in: Google Play Console → Store Listing → App icon

## File Reference

```
mobile-main/
├── assets/
│   ├── icon.png                 # Main icon (1024x1024)
│   ├── adaptive-icon.png        # Android foreground (1024x1024)
│   ├── splash-icon.png          # Splash screen
│   ├── notification-icon.png    # Push notifications
│   └── favicon.png              # Web
├── android/
│   └── app/src/main/res/
│       └── mipmap-*/            # Generated Android icons (cached)
└── ios/
    └── FamilyHelper/
        └── Images.xcassets/
            └── AppIcon.appiconset/  # Generated iOS icons (cached)
```
