$results = @()
foreach ($entry in $inputData) {
  $op = $entry.operation
  $snapshot = $entry.snapshot
  try {
    if ($op.kind -eq 'registry') {
      $root = if ($op.hive -eq 'HKCU') { [Microsoft.Win32.Registry]::CurrentUser } else { [Microsoft.Win32.Registry]::LocalMachine }
      if ($snapshot.exists) {
        $key = $root.CreateSubKey($op.path)
        try {
          $value = switch ($snapshot.type) {
            'DWord' { [BitConverter]::ToInt32([BitConverter]::GetBytes([uint32]$snapshot.value), 0) }
            'QWord' { [long]$snapshot.value }
            'Binary' { ,([byte[]]$snapshot.value) }
            'None' { ,([byte[]]$snapshot.value) }
            'MultiString' { ,([string[]]$snapshot.value) }
            default { [string]$snapshot.value }
          }
          $key.SetValue($op.name, $value, [Microsoft.Win32.RegistryValueKind]$snapshot.type)
          $key.Flush()
          if ($key.GetValueKind($op.name).ToString() -ne $snapshot.type) { throw 'Windows no confirmo el tipo de registro restaurado.' }
          $actual = $key.GetValue($op.name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
          if ((ConvertTo-Json -InputObject $actual -Compress) -ne (ConvertTo-Json -InputObject $value -Compress)) { throw 'Windows no confirmo el valor de registro restaurado.' }
        } finally { if ($null -ne $key) { $key.Dispose() } }
      } else {
        $key = $root.OpenSubKey($op.path, $true)
        $removeKey = $false
        try {
          if ($null -ne $key) {
            $key.DeleteValue($op.name, $false)
            $key.Flush()
            if (@($key.GetValueNames()) -contains $op.name) { throw 'No se pudo eliminar el valor creado.' }
            $removeKey = -not $snapshot.keyExisted -and $key.ValueCount -eq 0 -and $key.SubKeyCount -eq 0
          }
        } finally { if ($null -ne $key) { $key.Dispose() } }
        if ($removeKey) { $root.DeleteSubKey($op.path, $false) }
      }
    } elseif ($op.kind -eq 'service') {
      $sc = Join-Path $env:SystemRoot 'System32\sc.exe'
      $start = if ($snapshot.startType -eq 'Automatic') { if ($snapshot.delayedAuto) { 'delayed-auto' } else { 'auto' } } elseif ($snapshot.startType -eq 'Manual') { 'demand' } else { 'disabled' }
      $output = & $sc config $op.name 'start=' $start 2>&1 | Out-String
      if ($LASTEXITCODE -ne 0) { throw "No se pudo restaurar el servicio: $output" }
      $service = Get-CimInstance Win32_Service -Filter ("Name='{0}'" -f $op.name)
      $mode = if ($service.StartMode -eq 'Auto') { 'Automatic' } else { $service.StartMode }
      if ($mode -ne $snapshot.startType) { throw 'Windows no confirmo el modo original del servicio.' }
    } elseif ($op.kind -eq 'power') {
      $powercfg = Join-Path $env:SystemRoot 'System32\powercfg.exe'
      $output = & $powercfg /setactive $snapshot.scheme 2>&1 | Out-String
      if ($LASTEXITCODE -ne 0) { throw "No se pudo restaurar el plan de energia: $output" }
      $active = & $powercfg /getactivescheme 2>&1 | Out-String
      if ($LASTEXITCODE -ne 0 -or $active -notmatch [regex]::Escape($snapshot.scheme)) { throw 'Windows no confirmo el plan original.' }
    } else { throw 'Operacion no compatible.' }
    $results += @{ id = $entry.id; success = $true; message = 'Estado original restaurado y verificado.' }
  } catch { $results += @{ id = $entry.id; success = $false; message = $_.Exception.Message } }
}
ConvertTo-Json -InputObject @($results) -Depth 8 -Compress
