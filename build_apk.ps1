$env:JAVA_HOME = 'C:\Users\Admin\.gradle\jdks\eclipse_adoptium-17-amd64-windows\jdk-17.0.19+10'
$env:ANDROID_HOME = 'C:\Users\Admin\AppData\Local\Android\Sdk'
$env:ANDROID_SDK_ROOT = 'C:\Users\Admin\AppData\Local\Android\Sdk'
$env:Path = 'C:\Program Files\nodejs;C:\Users\Admin\.gradle\jdks\eclipse_adoptium-17-amd64-windows\jdk-17.0.19+10\bin;' + $env:Path
cd C:\Users\Admin\Desktop\paybot\mobile\android\android
cmd /c gradlew.bat assembleRelease
