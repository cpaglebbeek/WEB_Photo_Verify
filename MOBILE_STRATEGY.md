# PhotoVerify Mobile Strategy (v13.0)

## Objective
Transition PhotoVerify from a web-first application to a mobile-optimized experience, allowing creators to protect and verify photos directly from their smartphones.

## Phase 1: PWA (Progressive Web App) - *Current Goal*
Turn the web app into a PWA so it can be "installed" on iOS and Android without an app store.
- **Service Workers:** Enable offline access.
- **Manifest:** Define icons, splash screens, and theme colors.
- **Local-First:** Ensure all hashing and stamping remain 100% on-device.

## Phase 2: Mobile UI/UX Optimization
- **Touch Targets:** Increase button sizes for fingers.
- **Camera Integration:** Allow direct photo capture for verification.
- **Responsive Layout:** Optimize the "Wizard" for vertical screens.
- **Haptic Feedback:** Add subtle vibrations for "Success" or "Failure" results.

## Phase 3: Native Wrapper (Capacitor) - *In Progress*
Wrap the PWA in [Capacitor](https://capacitorjs.com/) to publish on the Apple App Store and Google Play Store.
- **Native File System:** Access the device gallery more efficiently. (Completed)
- **Share Extension:** Allow users to "Share to PhotoVerify" from their photo gallery. (Implemented via appRestoredResult and Android Intent)
- **Status Update:** Integrated local-first license synchronization with server retrieval.

## Technical Requirements
- HTTPS is mandatory (already handled by web server).
- Icons in various sizes (512x512, 192x192).
- Splash screen assets.
