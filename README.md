# ⌚ ChronosForge Studio

**Photorealistic 4K Smartwatch Face Designer & Native Android BLE Flasher**

ChronosForge Studio is a horological design suite and Android companion app built to create, customize, and flash high-precision watch faces directly onto **FitCloudPro (Realtek/TopStep)** and **VeryFit (IDO)** smartwatches. Unlike stock companion apps that restrict custom dials to flat static photos, ChronosForge renders multi-layered 3D watch components with real-time dynamic clock synchronization.

---

## ✨ Key Features

### 🎨 4K Supersampled Horology Engine
* **Internal `2048 × 2048` Rendering:** Every dial is rendered on an offscreen 4K canvas before downscaling cleanly to exact watch screen resolutions.
* **Multi-Layer 3D Depth:** Realistic brushed metal lugs, ceramic/tachymeter bezels, angled 45° inner chapter rings (rehauts), faceted luminous hour markers, recessed `azurage` sub-dials, split-plane 3D hands, and toggleable sapphire AR glass glare with an adjustable **Studio Light Angle**.

### 🖼️ Custom Photo Integration & Color Studio
* **Photo Dial Layer (`+`):** Upload custom `PNG`, `JPG`, or `WebP` backgrounds with live **Zoom (`50%–250%`), X/Y Pan, Rotation, Brightness, Contrast, and Edge Vignette** controls—rendered *underneath* the 3D bezel shadows, markers, and hands.
* **Auto Palette Extraction:** Automatically extracts 5 dominant **"Match Photo"** color swatches from any uploaded image.
* **3-Way Display Mode Switcher:** Switch seamlessly between **Analog**, **Hybrid**, and **Pure Digital** layouts with granular per-element color pickers, gradient digits, and readability backdrop pills.

### ⏱️ 100% Automatic Phone Clock Sync
* Locked directly to your device's system clock and 12h/24h locale settings.
* Exports clean static backgrounds paired with dynamic hardware RTC bindings so moving hands and `0–9` numeral sprites stay automatically synced with your phone.

### 📡 Native Android Bluetooth Bridge & Cloud APK Builder
* **Hardware Resolution Lock & Safe Dithering:** Automatically clamps exports to native watch displays (`466×466`, `454×454`, `360×360`, `368×448`, `240×284`) with Floyd-Steinberg RGB565 dithering and `#080808` shadow clamping to prevent transparency artifacts.
* **Direct BLE Flashing (`NativeWatchBridge`):** Built-in Android BLE scanner, Raw GATT service/characteristic inspector, and high-speed MTU packet streaming for direct watch face uploads.
* **Automated GitHub Actions CI/CD:** Compiles the web bundle, syncs Capacitor Android, and builds a downloadable `app-debug.apk` automatically on every push.

---

## 📱 Supported Formats & Platforms

| Platform / Chipset | Export Format | Transfer Method |
| :--- | :--- | :--- |
| **FitCloudPro** (Realtek / TopStep) | `.bin` (TBUI) | Native Android BLE Bridge / Quick Apply |
| **VeryFit / IDO** | `.iwf` / `.iwf.lz` | Native BLE GATT (`0x0AF0`) / Quick Apply |
| **Universal / Stock Apps** | High-Res `.png` | 1-Tap Clean Dial Download + Stock App Launch |

---

## 🚀 Download & Install the Android APK

1. Open the **Actions** tab at the top of this repository.
2. Select the latest completed **Build ChronosForge Android APK** workflow run.
3. Scroll down to **Artifacts** and download **`ChronosForge-Studio-Debug-APK`**.
4. Extract the ZIP on your Android device, install `app-debug.apk`, allow **Nearby Devices** permissions, and force-close your watch's stock app before flashing.

---

## 🛠️ Tech Stack

* **Frontend:** React, TypeScript, Vite, Tailwind CSS, HTML5 2D Canvas
* **Mobile Runtime:** Capacitor Android (`com.chronosforge.studio`)
* **Native Bridge:** Android `BluetoothLeScanner` & `BluetoothGatt` (`NativeWatchBridge.java`)
* **CI/CD:** GitHub Actions + Gradle + OpenJDK 21
