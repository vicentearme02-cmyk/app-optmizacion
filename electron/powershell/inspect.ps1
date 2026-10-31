$states = @{}
foreach ($entry in $inputData) {
  $op = $entry.operation
  try {
    if ($op.kind -eq 'registry') {
      $root = if ($op.hive -eq 'HKCU') { [Microsoft.Win32.Registry]::CurrentUser } else { [Microsoft.Win32.Registry]::LocalMachine }
      $key = $root.OpenSubKey($op.path, $false)
      try {
        $exists = $null -ne $key -and @($key.GetValueNames()) -contains $op.name
        $state = @{ available = $true; kind = 'registry'; keyExisted = ($null -ne $key); exists = $exists; type = $null; value = $null }
        if ($exists) {
          $type = $key.GetValueKind($op.name).ToString()
          $value = $key.GetValue($op.name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
          if ($type -eq 'DWord') { $value = [BitConverter]::ToUInt32([BitConverter]::GetBytes([int32]$value), 0) }
          if ($type -eq 'QWord') { $value = $value.ToString() }
          if ($type -in @('MultiString', 'Binary', 'None')) { $value = @($value) }
          if ($type -notin @('DWord', 'QWord', 'String', 'ExpandString', 'MultiString', 'Binary', 'None')) { throw 'Tipo de registro no compatible con restauracion.' }
          $state.type = $type
          $state.value = $value
        }
        $states[$entry.id] = $state
      } finally { if ($null -ne $key) { $key.Dispose() } }
    } elseif ($op.kind -eq 'service') {
      $service = Get-CimInstance Win32_Service -Filter ("Name='{0}'" -f $op.name)
      if ($null -eq $service) { throw 'Este servicio no esta instalado en tu version de Windows.' }
      $regKey = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey("SYSTEM\CurrentControlSet\Services\$($op.name)", $false)
      try { $delayed = $null -ne $regKey -and $regKey.GetValue('DelayedAutoStart', 0) -eq 1 }
      finally { if ($null -ne $regKey) { $regKey.Dispose() } }
      $startType = if ($service.StartMode -eq 'Auto') { 'Automatic' } else { $service.StartMode }
      $states[$entry.id] = @{ available = $true; kind = 'service'; startType = $startType; delayedAuto = $delayed; wasRunning = ($service.State -eq 'Running') }
    } elseif ($op.kind -eq 'power') {
      $powercfg = Join-Path $env:SystemRoot 'System32\powercfg.exe'
      $schemes = & $powercfg /list 2>&1 | Out-String
      if ($LASTEXITCODE -ne 0 -or $schemes -notmatch [regex]::Escape($op.scheme)) { throw 'Este plan de energia no esta disponible en el equipo.' }
      $active = & $powercfg /getactivescheme 2>&1 | Out-String
      if ($LASTEXITCODE -ne 0 -or $active -notmatch '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}') { throw 'No se pudo leer el plan de energia activo.' }
      $states[$entry.id] = @{ available = $true; kind = 'power'; scheme = $Matches[0].ToLowerInvariant() }
    } else { throw 'Operacion no compatible.' }
  } catch { $states[$entry.id] = @{ available = $false; message = $_.Exception.Message } }
}
ConvertTo-Json -InputObject $states -Depth 12 -Compress
