$results = @()
foreach ($entry in $inputData) {
  $op = $entry.operation
  try {
    if ($op.kind -eq 'registry') {
      $root = if ($op.hive -eq 'HKCU') { [Microsoft.Win32.Registry]::CurrentUser } else { [Microsoft.Win32.Registry]::LocalMachine }
      $key = $root.CreateSubKey($op.path)
      try {
        $value = if ($op.type -eq 'DWord') { [BitConverter]::ToInt32([BitConverter]::GetBytes([uint32]$op.value), 0) } else { [string]$op.value }
        $key.SetValue($op.name, $value, [Microsoft.Win32.RegistryValueKind]$op.type)
        $key.Flush()
        $actual = $key.GetValue($op.name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
        if ($actual -ne $value -or $key.GetValueKind($op.name).ToString() -ne $op.type) { throw 'Windows no confirmo el valor escrito.' }
      } finally { if ($null -ne $key) { $key.Dispose() } }
      $message = 'Ajuste guardado y verificado. Puede requerir cerrar sesion o reiniciar.'
    } elseif ($op.kind -eq 'service') {
      Set-Service -Name $op.name -StartupType $op.startType -ErrorAction Stop
      $current = Get-CimInstance Win32_Service -Filter ("Name='{0}'" -f $op.name)
      if ($current.StartMode -ne $op.startType) { throw 'Windows no confirmo el modo de inicio del servicio.' }
      $message = 'Inicio del servicio actualizado. No se detuvo el servicio; reinicia para completar el cambio.'
    } elseif ($op.kind -eq 'power') {
      $powercfg = Join-Path $env:SystemRoot 'System32\powercfg.exe'
      $output = & $powercfg /setactive $op.scheme 2>&1 | Out-String
      if ($LASTEXITCODE -ne 0) { throw "No se pudo cambiar el plan de energia: $output" }
      $active = & $powercfg /getactivescheme 2>&1 | Out-String
      if ($LASTEXITCODE -ne 0 -or $active -notmatch [regex]::Escape($op.scheme)) { throw 'Windows no confirmo el plan seleccionado.' }
      $message = 'Plan de energia activado y verificado.'
    } else { throw 'Operacion no compatible.' }
    $results += @{ id = $entry.id; success = $true; message = $message }
  } catch { $results += @{ id = $entry.id; success = $false; message = $_.Exception.Message } }
}
ConvertTo-Json -InputObject @($results) -Depth 8 -Compress
