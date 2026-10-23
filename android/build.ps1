# Rebuilds web/public/dramora.apk. The keystore is created on the first run
# and reused so later installs can update in place. Password: dramora
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $root
$sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$buildTools = Join-Path $sdk 'build-tools\36.0.0'
$androidJar = Join-Path $sdk 'platforms\android-37.0\android.jar'
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$javac = Join-Path $env:JAVA_HOME 'bin\javac.exe'
$keytool = Join-Path $env:JAVA_HOME 'bin\keytool.exe'
$build = Join-Path $env:TEMP 'dramora-apk-build'
$keystore = Join-Path $root 'dramora.keystore'
$out = Join-Path $repo 'web\public\dramora.apk'

if (Test-Path $build) { Remove-Item -Recurse -Force $build }
New-Item -ItemType Directory -Path (Join-Path $build 'gen'), (Join-Path $build 'classes'), (Join-Path $build 'dex') | Out-Null

& (Join-Path $buildTools 'aapt2.exe') compile --dir (Join-Path $root 'res') -o (Join-Path $build 'compiled.zip')
if ($LASTEXITCODE -ne 0) { throw 'aapt2 compile failed' }
& (Join-Path $buildTools 'aapt2.exe') link -o (Join-Path $build 'linked.apk') -I $androidJar --manifest (Join-Path $root 'AndroidManifest.xml') --java (Join-Path $build 'gen') --min-sdk-version 21 --target-sdk-version 34 (Join-Path $build 'compiled.zip')
if ($LASTEXITCODE -ne 0) { throw 'aapt2 link failed' }

$sources = @(Get-ChildItem -Recurse -Path (Join-Path $root 'src'), (Join-Path $build 'gen') -Filter *.java | ForEach-Object { $_.FullName })
& $javac --release 17 -encoding UTF-8 -classpath $androidJar -d (Join-Path $build 'classes') $sources
if ($LASTEXITCODE -ne 0) { throw 'javac failed' }

$classes = @(Get-ChildItem -Recurse -Path (Join-Path $build 'classes') -Filter *.class | ForEach-Object { $_.FullName })
& (Join-Path $buildTools 'd8.bat') --min-api 21 --lib $androidJar --output (Join-Path $build 'dex') $classes
if ($LASTEXITCODE -ne 0) { throw 'd8 failed' }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open((Join-Path $build 'linked.apk'), 'Update')
try {
    $existing = $zip.GetEntry('classes.dex')
    if ($existing) { $existing.Delete() }
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $build 'dex\classes.dex'), 'classes.dex') | Out-Null
} finally {
    $zip.Dispose()
}

& (Join-Path $buildTools 'zipalign.exe') -f -p 4 (Join-Path $build 'linked.apk') (Join-Path $build 'aligned.apk')
if ($LASTEXITCODE -ne 0) { throw 'zipalign failed' }

if (-not (Test-Path $keystore)) {
    & $keytool -genkeypair -keystore $keystore -storepass dramora -keypass dramora -alias dramora -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Dramora, OU=Dramora, O=Dramora, L=Local, ST=Local, C=US'
    if ($LASTEXITCODE -ne 0) { throw 'keytool failed' }
}

& (Join-Path $buildTools 'apksigner.bat') sign --ks $keystore --ks-pass pass:dramora --key-pass pass:dramora --out $out (Join-Path $build 'aligned.apk')
if ($LASTEXITCODE -ne 0) { throw 'apksigner failed' }
& (Join-Path $buildTools 'apksigner.bat') verify $out
if ($LASTEXITCODE -ne 0) { throw 'apk verify failed' }
Write-Output "Wrote $out"
