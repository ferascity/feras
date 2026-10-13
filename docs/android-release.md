# Android Release

Feras releases use the Android package `com.feras.app` and must be signed with
the same release key for every update.

## Build

1. Create `android/keystore.properties` from
   `android/keystore.properties.example` and point it to the private release
   key. Do not commit either the private key or this properties file.
2. Build a signed APK:

   ```sh
   cd android
   ./gradlew assembleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a
   ```

3. The artifact is written to
   `android/app/build/outputs/apk/release/app-release.apk`.
4. Record a checksum:

   ```sh
   sha256sum android/app/build/outputs/apk/release/app-release.apk
   ```

## Distribution

Attach the versioned APK and checksum to a public GitHub Release. The direct
GitHub asset URL can be used wherever an Android APK URL is required.

The Solana dApp Store CLI can alternatively upload the local signed APK with
`--apk-file`; it does not require a separately hosted URL.
