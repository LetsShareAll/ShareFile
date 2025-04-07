# Copyright (c) LetsShareAll Team.
# Licensed under the MIT License.

#####################################################################################################
#
# 将指定的可执行文件添加到 Windows 终端的配置文件中。
#
# 如果指定了参数 '-Program'、'-Name' 和 '-Icon'，脚本会将当前目录或子目录中的可执行文件
# 添加到 Windows 终端的配置文件中，允许用户通过终端直接调用该可执行文件，并指定图标。
#
# 假设：
#     1. Windows 终端已安装并且配置文件路径正确。
#     2. 可执行文件在当前目录或其子目录中。
#
#####################################################################################################

<#
.SYNOPSIS
    将指定的可执行文件添加到 Windows 终端的配置文件中。

.DESCRIPTION
    此脚本用于将当前目录或子目录中的可执行文件添加到 Windows 终端的配置文件中，允许用户通过终端直接调用该可执行文件，并指定图标。

.PARAMETER Program
    要添加到 Windows 终端的可执行文件的相对路径。

.PARAMETER Name
    在 Windows 终端中显示的配置名称。

.PARAMETER Icon
    显示在 Windows 终端配置中的图标文件路径。
    
.AUTHOR
    Shuery
    Shuery@Lssa.Fun
    2024/07/01

.EXAMPLE
    .\AddProfileToTerminal.ps1 -Program "pwsh.exe" -Name "PowerShell" -Icon "pwsh.ico"
    将当前目录下的 pwsh.exe 添加到 Windows 终端配置中，显示名称为 "PowerShell"，并使用 pwsh.ico 作为图标。

.EXAMPLE
    .\AddProfileToTerminal.ps1 -Program "bin\bash.exe" -Name "Git Bash" -Icon "git.ico"
    将当前目录下的 bin\bash.exe 添加到 Windows 终端配置中，显示名称为 "Git Bash"，并使用 git.ico 作为图标。

.NOTES
    需要确保已安装 Windows 终端，并且配置文件路径正确。
#>

param (
    [string]$Program,
    [string]$Name,
    [string]$Icon
)

function Backup-SettingsFile {
    param ($SettingsPath)
    $backupPath = "$SettingsPath.bak"
    Copy-Item -Path $SettingsPath -Destination $backupPath -Force
    Write-Host "Configuration file backed up to $backupPath"
}

function Add-ProgramToTerminal {
    param ($ProgramPath, $Name, $Icon)
    $settingsPath = [System.IO.Path]::Combine($env:LocalAppData, 'Packages', 'Microsoft.WindowsTerminal_8wekyb3d8bbwe', 'LocalState', 'settings.json')

    if (-not (Test-Path -Path $settingsPath)) {
        Write-Host "Windows Terminal configuration file does not exist. Please ensure Windows Terminal is installed."
        exit
    }

    Backup-SettingsFile -SettingsPath $settingsPath

    $json = Get-Content -Path $settingsPath -Raw | ConvertFrom-Json

    $newProfile = @{
        guid        = "{" + [guid]::NewGuid().ToString() + "}"
        name        = $Name
        commandline = $ProgramPath
        icon        = $Icon
        hidden      = $false
    }

    $json.profiles.list += $newProfile

    $json | ConvertTo-Json -Depth 32 | Set-Content -Path $settingsPath -Force

    Write-Host "Added $ProgramPath to Windows Terminal configuration file."
}

$currentDirectory = (Get-Location).Path.TrimEnd('\')
$programPath = Join-Path -Path $currentDirectory -ChildPath $Program
$iconPath = Join-Path -Path $currentDirectory -ChildPath $Icon

if (-not (Test-Path -Path $programPath)) {
    Write-Host "$Program does not exist in the current directory. Please ensure the $Program file exists."
    exit
}

Add-ProgramToTerminal -ProgramPath $programPath -Name $Name -Icon $iconPath
