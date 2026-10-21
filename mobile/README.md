# WebNEWS mobile app (Android + iOS)

A native app shell (Capacitor 8) that opens the WebNEWS website, so the app has the site's exact screens and
features and updates whenever the site is deployed. Native extras: app icon + splash, the phone's share sheet,
edge-to-edge layout under the status bar, Android back button, iOS swipe-back, an offline screen.

## Try it on your computer

1. Start the site as usual (`backend` on :4000, `frontend` on :3000).
2. `cd mobile && npm install` (first time only)
3. **Android** (needs [Android Studio](https://developer.android.com/studio)): start an emulator or plug in a phone
   with USB debugging, then
   `adb reverse tcp:3000 tcp:3000 && npm run android` → press ▶ Run in Android Studio.
4. **iOS** (needs Xcode from the Mac App Store): `npm run ios` → pick a simulator → ▶ Run.

## Android test build on your phone (same Wi-Fi, no Android Studio)

One-time setup on this Mac (already done 2026-09-28): Temurin JDK 21 in `~/Library/Java/JavaVirtualMachines`,
Android SDK (platform 36, build-tools 36, platform-tools) in `~/Library/Android/sdk`.

```sh
cd mobile
export JAVA_HOME=~/Library/Java/JavaVirtualMachines/jdk-21.0.12.1+1/Contents/Home ANDROID_HOME=~/Library/Android/sdk
WEBNEWS_URL=https://<this Mac's Wi-Fi IP>:3443 npx cap sync android
(cd android && ./gradlew assembleDebug)
npm run phone      # keep running; prints the links
```

On the phone (same Wi-Fi) open `http://<Wi-Fi IP>:3100/webnews.apk`, install it (allow "install unknown apps" for
the browser), open WebNEWS. `npm run phone` relays the phone to the site on :3000 as if it were localhost, so the
site's settings stay unchanged. If the Mac's Wi-Fi IP changes, sync + build again. Debug builds allow plain http
(`src/debug/res/xml/network_security_config.xml`); release builds are https only.

The app opens the relay's **https** address (:3443): phones allow the camera and microphone (press meets) only on
https pages. `npm run phone` makes a self-signed certificate for the Wi-Fi address (`mobile/.dev-cert/`, once) and
debug builds accept it for private network addresses only (MainActivity `trustDevServer`). In the phone's own
browser the https address shows a certificate warning — use the app, or the http address (:3100) without camera/mic.

## Push notifications (Firebase)

New stories from reporters you follow, likes and comments on your stories (owner 2026-10-02). Needs one Firebase
project (console.firebase.google.com):

1. **The app:** Project settings → Your apps → Add app → Android, package name **`in.webnews.app`** (exactly — a
   different package makes the build fail with "No matching client found"). Download `google-services.json` into
   `mobile/android/app/`, then rebuild the APK (above). Without the file the app still builds and runs, just without
   push (the site checks first: `PushSupport`, MainActivity).
2. **The backend:** Project settings → Service accounts → Generate new private key. Put the file in `backend/` and its
   name in `backend/.env` as `FIREBASE_SERVICE_ACCOUNT_FILE=` (or paste the JSON into `FIREBASE_SERVICE_ACCOUNT_JSON=`
   on hosts without files), then restart the backend — its start-up line says `push: on`.

The app asks for permission when it opens; Settings → Notifications (in the app) turns pushes off for the account.

## In Android Studio

`npm run android` (or File → Open → `mobile/android`). The build runs on Java 21
(`android/gradle/gradle-daemon-jvm.properties`): Gradle 8.14 can't run on Studio's bundled Java 25, so Gradle picks
the installed JDK 21 itself. Press ▶ Run with a phone plugged in (USB debugging on) or an emulator from Device Manager.

## Store builds

The app must open the **deployed https site**, not localhost:

```sh
WEBNEWS_URL=https://your-domain npx cap sync
```

then build in Android Studio (Build → Generate Signed App Bundle → upload to Google Play) and Xcode
(Product → Archive → upload to App Store Connect). Needs a Google Play developer account ($25 once) and an Apple
Developer account ($99/year). App id: `in.webnews.app`.

## Notes

- Icons/splash are rendered from `frontend/public/brand/icon.svg`.
- "Continue with Google" uses the phone's own account picker (`@capgo/capacitor-social-login`; Google blocks its web
  sign-in page inside app web views). The site sends the ID token to the backend, which checks it against
  `GOOGLE_CLIENT_ID` (frontend `NEXT_PUBLIC_GOOGLE_CLIENT_ID` = the same Web client ID). Android needs an **Android**
  OAuth client in the same Google Cloud project: package `in.webnews.app` + the SHA-1 of the key that signs the APK
  (debug: `keytool -list -v -keystore ~/.android/debug.keystore -storepass android`; Play: the app signing key's
  SHA-1 from Play Console). iOS still needs its own iOS OAuth client before Google shows there.
- Change a setting in `capacitor.config.ts` → run `npx cap sync` again.
