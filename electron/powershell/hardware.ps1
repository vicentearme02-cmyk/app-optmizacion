$cpus = @(Get-CimInstance Win32_Processor)
$system = Get-CimInstance Win32_OperatingSystem
$memory = @(Get-CimInstance Win32_PhysicalMemory)
$gpus = @(Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notmatch 'Microsoft Basic|Remote Display' })
if ($gpus.Count -eq 0) { $gpus = @(Get-CimInstance Win32_VideoController) }
$gpu = $gpus | Sort-Object AdapterRAM -Descending | Select-Object -First 1
$logicalDisks = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3')
$drives = @($logicalDisks | ForEach-Object { @{ name = $_.DeviceID; totalGB = [math]::Round($_.Size / 1GB, 1); freeGB = [math]::Round($_.FreeSpace / 1GB, 1); type = 'Disco local' } })
$ramTypeCode = if ($memory.Count -gt 0) { $memory[0].SMBIOSMemoryType } else { 0 }
$ramType = switch ($ramTypeCode) { 20 { 'DDR' } 21 { 'DDR2' } 24 { 'DDR3' } 26 { 'DDR4' } 34 { 'DDR5' } default { 'RAM' } }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
$gpuMemory = if ($null -ne $gpu -and $gpu.AdapterRAM -gt 0) { [math]::Round($gpu.AdapterRAM / 1GB, 1) } else { $null }
$totalRAM = [math]::Round($system.TotalVisibleMemorySize / 1MB, 1)
$usedRAM = [math]::Round(($system.TotalVisibleMemorySize - $system.FreePhysicalMemory) / 1MB, 1)
$cpuUsage = ($cpus | Measure-Object -Property LoadPercentage -Average).Average
$result = @{
  mode = 'native'
  platform = 'win32'
  cpu = @{ name = ($cpus | ForEach-Object { $_.Name.Trim() }) -join ' / '; cores = ($cpus | Measure-Object -Property NumberOfCores -Sum).Sum; usage = $cpuUsage }
  gpu = @{ name = if ($null -ne $gpu) { $gpu.Name } else { 'GPU no detectada' }; memoryGB = $gpuMemory; usage = $null }
  ram = @{ totalGB = $totalRAM; usedGB = $usedRAM; type = $ramType }
  storage = @{ totalGB = [math]::Round(($logicalDisks | Measure-Object -Property Size -Sum).Sum / 1GB, 1); freeGB = [math]::Round(($logicalDisks | Measure-Object -Property FreeSpace -Sum).Sum / 1GB, 1); drives = $drives }
  os = "$($system.Caption) (build $($system.BuildNumber))"
  updatedAt = [DateTime]::UtcNow.ToString('o')
  admin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
ConvertTo-Json -InputObject $result -Depth 8 -Compress
