# Android Firebase config

`google-services.json` se copia automáticamente desde aquí al template de
`@capacitor/android` durante `bun run build` (paso `node
scripts/stage-firebase-config.mjs`). Después, cuando el workflow ejecuta
`npx cap add android`, Capacitor copia el template — ya con el archivo
incluido — a `android/app/google-services.json`.

## Por qué está commiteado en el repo

El archivo `google-services.json` para Android contiene el `mobilesdk_app_id`
y el `current_key` (API key) de Firebase. **Para Android, ese API key no es
secreto**: Firebase lo restringe por package name (`com.pick3.app`) + SHA-1
del certificado de firma, no por secrecidad del archivo. El mismo contenido
está embebido en cada APK release que se distribuye, así que cualquiera con
acceso a la APK puede extraerlo igualmente.

Referencia oficial:
https://firebase.google.com/docs/projects/api-keys

## Cómo actualizar este archivo

1. Firebase Console → Project Settings → Your apps → `com.pick3.app`.
2. Descargar `google-services.json`.
3. Reemplazar el archivo en `android-config/google-services.json`.
4. Commit + push. El siguiente build lo recogerá automáticamente.

## Hardening recomendado

Para reducir la superficie de abuso del API key:
1. Google Cloud Console → APIs & Services → Credentials → seleccionar el
   "Android key (auto created by Firebase)".
2. Sección "Application restrictions" → seleccionar "Android apps".
3. Agregar restricción con package name `com.pick3.app` + SHA-1 fingerprint
   del certificado de firma release (obtenible con
   `keytool -list -v -keystore pick3-release.p12 -storetype PKCS12`).

Esto bloquea cualquier request que no provenga de una APK firmada con el
certificado oficial.
