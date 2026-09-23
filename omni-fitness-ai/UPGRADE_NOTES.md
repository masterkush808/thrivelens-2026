# Thrive Lens — Gold & Obsidian styling upgrade

## Apply to your existing app

1. Extract `thrivelens-styling.zip`.
2. Copy the **contents** of `thrivelens-styling/` into the root of your existing Thrive Lens project, merging `src/` and `assets/` and replacing matching files. Do not delete or replace your entire existing `src/` folder: the supplied styling bundle does not contain your complete app.
3. Keep your existing package.json, lockfile, Metro configuration, environment settings, database files, repositories, authentication provider, models, and services. This upgrade preserves the 45 original filenames and relative paths and adds the brand components, inspiration catalog/provider, motion hook, and selected image needed by them.
4. From your existing project root, run:

   ```bash
   npx expo start --clear
   ```

5. Rebuild your installed native app for app-icon, app-name, and native splash configuration changes. Verify the native splash in a release build; Expo Go and development builds do not fully reproduce that presentation. The in-app welcome and inspiration screens can be reviewed while developing.

The upgrade uses the libraries already referenced by the supplied source/configuration: React Native, Expo Router, React Navigation, React Native Reanimated, NativeWind, Expo Linear Gradient, Expo SecureStore, React Native Safe Area Context, React Native SVG, Lucide and Expo icons. No new animation, quote-service, font-download, or blur dependency is required. No package versions have been changed in your app because its package manifest was not included.

## Included experience

- The exact selected logo, unchanged, at `assets/images/297b11a4-1998-4a78-8749-65a9fd0d3ba0.png`. The wordmark is **Thrive Lens**.
- Consistent gold, champagne, obsidian and warm-neutral colors across tokens, NativeWind configuration, CSS, components and screen styling. Status and chart colors remain distinguishable.
- An editorial welcome screen with elegant serif headlines, the selected logo, inspiration, and the existing working sign-up/sign-in routes. The inspiration card appears before the feature list on phones.
- A gold tab selection highlight glides between all six tabs. Screen content arrives with a restrained 340 ms fade/lift while existing screen state remains mounted under the navigator.
- A low-opacity blurred-logo atmosphere behind the screen content. Only transforms and opacity animate; the blur itself is static. A gentle 14-second settling movement stops rather than running indefinitely. Opaque cards and a dark scrim keep text readable.
- Gold controls with dark labels, input focus states, warmer card surfaces, readable secondary text, usable touch targets, functional pressable cards and correctly drawn progress rings.
- The native icon, web favicon, auth loading screen, and splash reference the included logo. `app.json` retains identifiers, scheme, permissions, and plugin registrations from the supplied file. Old adaptive-icon asset references were replaced by the selected standard icon. The notification plugin uses its default small icon rather than misusing the full-color logo as an Android monochrome notification glyph.

## Inspiration behavior

`src/data/motivations.ts` contains **100 original short messages**: 20 each for fresh starts, movement, nourishment, recovery and steady growth. These are locally curated text, not generated health advice or a remote service. They work offline and require no sign-in to a quote provider.

- Each cold application start selects a fresh message.
- The next local calendar day refreshes the message, including across midnight while the app remains active.
- Returning after at least 30 minutes away selects a fresh launch message. Brief backgrounding, tab changes and screen navigation do not constantly change it.
- The complete catalog is cycled before repetitions; consecutive selections are never identical when history is available.
- Native history uses Expo SecureStore. Web history uses localStorage. If storage is blocked, inspiration remains usable for that session; history across restarts then cannot be guaranteed.
- Returning signed-in users receive a dismissible launch moment when Home is visible. The close control, Android back action and “Step into today” dismiss it immediately. No compulsory delay or spoken audio.
- Returning to a camera or workout does not interrupt that screen. The launch moment is deferred until Home.
- “Another thought” manually reveals a different message with a gentle fade; it never reopens the launch moment. Date changes update the card without forcing an overlay.
- The welcome screen, launch moment and Home card share one provider and one current selection.

To edit the collection, keep IDs unique and stable and retain at least two entries. Add text in the existing `id`, `title`, `message`, `category` shape. Category keys are `begin`, `move`, `nourish`, `recover`, and `grow`.

## Accessibility and motion

New animations respect the operating system reduced-motion preference and pause while inactive. Decorative background elements are hidden from assistive technology and cannot intercept input. No strobing, autoplay sound, timed dismissal or auto-advancing reading carousel is used. The backgrounds are decorative; data, errors, cameras, authentication and model integrations remain functional responsibilities of the host app.

Measured core token contrast includes 10.66:1 for dark text on primary gold, 5.94:1 on pressed gold, and 7.15:1 for tertiary text on the base surface. These checks apply to those color pairs; they are not a claim of a full accessibility certification.

## Verification and scope

- All 45 original file paths retained; selected logo byte-for-byte preserved.
- Babel syntax parsing: 47 TypeScript/TSX source files passed.
- Strict TypeScript check passed for theme/UI components, new brand components, motion hook, inspiration provider/catalog, welcome screen and tab layout in an isolated Expo 54 / Router 6 / React Native 0.81 validation environment. Your host app's exact dependency versions were not supplied.
- Configuration JavaScript syntax and all new PNG import paths passed.
- 12 inspiration behavior tests passed, including 500 queued selections, full-cycle uniqueness, cold reload, daily rollover, 30-minute return, blocked/corrupt storage, effect replay and cleanup.
- Actual welcome/launch components rendered in React Native Web at 320 px, 390 px and 1440 px widths: no horizontal overflow or page exceptions; next-message, sign-up route intent and launch dismissal passed. Routing was a small test adapter; this was not a full backend or native integration run.
- `previews/` contains screenshots from that isolated component rendering, not invented device mockups.

A complete application build and physical Android/iOS device test have not been performed: the uploaded ZIP omits the host package manifest, data layer, services and other app files. After merging, check all six tabs, sign-in, onboarding, camera/barcode views, keyboard handling, large text, reduced motion, a fresh launch and a return to an active workout. The styling work does not retrain or replace any AI model.

Technical references: [Expo tabs](https://docs.expo.dev/router/advanced/tabs/), [React Navigation tabs](https://reactnavigation.org/docs/bottom-tab-navigator/), [Expo native splash behavior](https://docs.expo.dev/versions/latest/sdk/splash-screen/).
