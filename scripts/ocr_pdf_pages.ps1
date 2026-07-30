param(
  [Parameter(Mandatory = $true)]
  [string]$ImageDirectory,
  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory
)

Add-Type -AssemblyName System.Runtime.WindowsRuntime

function Await-WinRt {
  param(
    [Parameter(Mandatory = $true)]$Operation,
    [Parameter(Mandatory = $true)][Type]$ResultType
  )

  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object {
      $_.Name -eq 'AsTask' -and
      $_.IsGenericMethod -and
      $_.GetParameters().Count -eq 1
    } |
    Select-Object -First 1
  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.Wait()
  return $task.Result
}

$inputResolved = (Resolve-Path -LiteralPath $ImageDirectory).Path
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$outputResolved = (Resolve-Path -LiteralPath $OutputDirectory).Path
$engine = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]::TryCreateFromUserProfileLanguages()

foreach ($image in Get-ChildItem -File -LiteralPath $inputResolved -Filter '*.png' | Sort-Object Name) {
  $storageFile = Await-WinRt (
    [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]::GetFileFromPathAsync($image.FullName)
  ) ([Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime])
  $stream = Await-WinRt (
    $storageFile.OpenAsync([Windows.Storage.FileAccessMode]::Read)
  ) ([Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime])
  $decoder = Await-WinRt (
    [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]::CreateAsync($stream)
  ) ([Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime])
  $bitmap = Await-WinRt (
    $decoder.GetSoftwareBitmapAsync()
  ) ([Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime])
  $result = Await-WinRt (
    $engine.RecognizeAsync($bitmap)
  ) ([Windows.Media.Ocr.OcrResult, Windows.Foundation, ContentType = WindowsRuntime])

  $target = Join-Path $outputResolved ($image.BaseName + '.txt')
  Set-Content -LiteralPath $target -Value $result.Text -Encoding UTF8
  Write-Output ($image.Name + ' -> ' + $result.Text.Length + ' chars')
}
