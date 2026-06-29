$keystore = 'C:\Users\Admin\Desktop\paybot\mobile\keystore.jks'
$base64file = 'C:\Users\Admin\Desktop\paybot\mobile\keystore_base64.txt'
if (Test-Path $keystore) {
    $bytes = [System.IO.File]::ReadAllBytes($keystore)
    $b64 = [System.Convert]::ToBase64String($bytes)
    Set-Content -Path $base64file -Value $b64 -Encoding Ascii
    Write-Output "WROTE_BASE64:$base64file"
} else {
    Write-Error "Keystore not found: $keystore"
    exit 2
}
