# CLI-Only APK Building Methods

Here are several ways to build APKs using only command line tools, no Android Studio required:

## Method 1: Using GitHub Actions (100% Online, No Local Setup)

Create `.github/workflows/build-apk.yml`:

```yaml
name: Build APK
on:
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Install dependencies
        run: npm install

      - name: Build web app
        run: npm run build

      - name: Sync Capacitor
        run: npx cap sync android

      - name: Build APK
        run: cd android && ./gradlew assembleDebug

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: location-monitor-debug
          path: android/app/build/outputs/apk/debug/app-debug.apk
```

**Usage:**
1. Commit and push your code to GitHub
2. Go to Actions tab in your repo
3. Run the workflow
4. Download the APK from artifacts

## Method 2: Using Docker (Local, No Java Installation)

Create `Dockerfile`:

```dockerfile
FROM node:18-bullseye

# Install Java and Android tools
RUN apt-get update && apt-get install -y openjdk-17-jdk wget unzip
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

# Install Android SDK
ENV ANDROID_HOME=/opt/android-sdk
RUN mkdir -p ${ANDROID_HOME}/cmdline-tools
RUN wget https://dl.google.com/android/repository/commandlinetools-linux-9477386_latest.zip
RUN unzip commandlinetools-linux-9477386_latest.zip -d ${ANDROID_HOME}/cmdline-tools
RUN mv ${ANDROID_HOME}/cmdline-tools/cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest

ENV PATH=${PATH}:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools

# Accept licenses and install components
RUN yes | sdkmanager --licenses
RUN sdkmanager "platform-tools" "platforms;android-33" "build-tools;33.0.0"

WORKDIR /app
COPY . .

RUN npm install
RUN npm run build
RUN npx cap sync android
RUN cd android && ./gradlew assembleDebug

# Copy APK to output
RUN cp android/app/build/outputs/apk/debug/app-debug.apk /app/location-monitor.apk
```

**Build commands:**
```bash
docker build -t location-monitor-build .
docker run --rm -v ${PWD}:/output location-monitor-build cp /app/location-monitor.apk /output/
```

## Method 3: Using Chocolatey (Windows - Quickest Local Setup)

Install Java and Android tools:

```powershell
# Install Chocolatey if not installed
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install Java
choco install openjdk17

# Install Android SDK
choco install android-sdk

# Refresh environment
refreshenv

# Build APK
npm run build
npx cap sync android
cd android
.\gradlew assembleDebug
```

## Method 4: Using Portable Java (No Installation Required)

1. **Download Portable JDK:**
   ```powershell
   # Download portable JDK 17
   Invoke-WebRequest -Uri "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.9%2B9/OpenJDK17U-jdk_x64_windows_hotspot_17.0.9_9.zip" -OutFile "jdk17.zip"
   
   # Extract
   Expand-Archive jdk17.zip -DestinationPath "C:\PortableJDK"
   
   # Set environment for current session
   $env:JAVA_HOME = "C:\PortableJDK\jdk-17.0.9+9"
   $env:PATH += ";$env:JAVA_HOME\bin"
   ```

2. **Build APK:**
   ```powershell
   npm run build
   npx cap sync android
   cd android
   .\gradlew assembleDebug
   ```

## Method 5: Using Termux (Android Phone)

You can build APKs directly on your Android phone:

```bash
# Install Termux from F-Droid
# In Termux:
pkg update && pkg upgrade
pkg install nodejs openjdk-17 git

# Clone your repo
git clone https://github.com/yourusername/location-monitor
cd location-monitor

# Build
npm install
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
```

## Method 6: Online Build Services

### Using CodeSandbox:
1. Import your GitHub repo to CodeSandbox
2. Add build script to package.json
3. Run in terminal

### Using Gitpod:
1. Open your repo in Gitpod
2. Install Java and Android SDK
3. Build APK

## Quick Commands Summary

For any method above, the core commands are always:
```bash
npm install          # Install dependencies
npm run build        # Build Next.js app
npx cap sync android # Sync to Android
cd android           # Enter Android directory
./gradlew assembleDebug  # Build APK (Unix/Linux)
.\gradlew assembleDebug  # Build APK (Windows)
```

The APK will be at: `android/app/build/outputs/apk/debug/app-debug.apk`

## Recommendation

For the **easiest approach with zero local setup**: Use **GitHub Actions** (Method 1). Just commit your code and let GitHub build the APK for you!

For **quickest local setup**: Use **Chocolatey** (Method 3) if you're on Windows.
