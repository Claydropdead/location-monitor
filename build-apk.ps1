# Quick APK Build Script for Windows
# This script downloads portable Java and builds your APK without installing anything permanently

Write-Host "Building Location Monitor APK..." -ForegroundColor Green

# Create temp directory for Java
$javaDir = "$env:TEMP\PortableJDK17"
$javaZip = "$env:TEMP\jdk17.zip"

if (!(Test-Path $javaDir)) {
    Write-Host "Downloading portable JDK 17..." -ForegroundColor Yellow
    
    # Download JDK 17 (portable)
    $jdkUrl = "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.9%2B9/OpenJDK17U-jdk_x64_windows_hotspot_17.0.9_9.zip"
    
    try {
        Invoke-WebRequest -Uri $jdkUrl -OutFile $javaZip -UseBasicParsing
        Write-Host "JDK downloaded successfully" -ForegroundColor Green
        
        Write-Host "Extracting JDK..." -ForegroundColor Yellow
        Expand-Archive -Path $javaZip -DestinationPath $javaDir -Force
        
        # Find the actual JDK folder
        $jdkFolder = Get-ChildItem -Path $javaDir -Directory | Select-Object -First 1
        $actualJavaHome = $jdkFolder.FullName
        
        Write-Host "JDK extracted successfully" -ForegroundColor Green
        Remove-Item $javaZip -Force
    }
    catch {
        Write-Host "Failed to download JDK: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "Portable JDK already exists" -ForegroundColor Green
    $jdkFolder = Get-ChildItem -Path $javaDir -Directory | Select-Object -First 1
    $actualJavaHome = $jdkFolder.FullName
}

# Set Java environment for this session
$env:JAVA_HOME = $actualJavaHome
$env:PATH = "$actualJavaHome\bin;$env:PATH"

Write-Host "Java setup complete" -ForegroundColor Green

# Verify Java
try {
    $javaVersion = & java -version 2>&1
    Write-Host "Java version verified" -ForegroundColor Green
}
catch {
    Write-Host "Java verification failed" -ForegroundColor Red
    exit 1
}

# Build the project
Write-Host "Building Location Monitor APK..." -ForegroundColor Green

try {
    Write-Host "Installing npm dependencies..." -ForegroundColor Yellow
    npm install
    
    Write-Host "Building Next.js app..." -ForegroundColor Yellow
    npm run build
    
    Write-Host "Syncing Capacitor..." -ForegroundColor Yellow
    npx cap sync android
    
    Write-Host "Building APK..." -ForegroundColor Yellow
    Set-Location android
    & .\gradlew.bat assembleDebug
    Set-Location ..
    
    # Check if APK was created
    $apkPath = "android\app\build\outputs\apk\debug\app-debug.apk"
    if (Test-Path $apkPath) {
        $apkSize = (Get-Item $apkPath).Length / 1MB
        Write-Host ""
        Write-Host "APK built successfully!" -ForegroundColor Green
        Write-Host "Location: $apkPath" -ForegroundColor Cyan
        Write-Host "Size: $([math]::Round($apkSize, 2)) MB" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "You can now install this APK on your Android device!" -ForegroundColor Green
    } else {
        Write-Host "APK not found - build may have failed" -ForegroundColor Red
        exit 1
    }
}
catch {
    Write-Host "Build failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Cleanup: The portable Java will remain for future builds" -ForegroundColor Gray
