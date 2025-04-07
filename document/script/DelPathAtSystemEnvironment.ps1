# Copyright (c) LetsShareAll Team.
# Licensed under the MIT License.

#####################################################################################################
#
# 将当前路径或其下的二进制文件夹从系统环境变量删除。
#
# 此脚本将当前目录或其下的 'bin' 子目录（如果存在）从系统环境变量 PATH 中删除。
#
# 假设：
#     1. 可执行文件在当前目录或其子目录中。
#
#####################################################################################################

<#
.SYNOPSIS
    将当前路径或其下的二进制文件夹从系统环境变量删除。

.DESCRIPTION
    此脚本将当前目录或其下的 'bin' 子目录（如果存在）从系统环境变量 PATH 中删除。

.NOTES
    - 需要管理员权限以修改系统环境变量。
    - 自动检测 PowerShell 是否安装，并尝试提升权限。
    - 修改 PATH 后显示当前系统环境变量。

.AUTHOR
    Shuery
    Shuery@Lssa.Fun
    2024/07/01

.PARAMETER None
    不需要显式传递参数。脚本自动检测管理员权限和 PowerShell 可执行文件。

.EXAMPLE
    .\DelPathAtSystemEnvironment.ps1
    如果当前目录或 'bin' 子目录存在，则将其从系统环境变量 PATH 中删除。

#>

$Host.UI.RawUI.WindowTitle = "Removing current directory or its 'bin' subdirectory from system environment variable..."

function Test-Administrator {
    [OutputType([bool])]
    param()
    process {
        [Security.Principal.WindowsPrincipal]$user = [Security.Principal.WindowsIdentity]::GetCurrent()
        return $user.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
    }
}

function Test-CommandExist {
    param ($Command)
    $OldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Stop'
    try {
        if (Get-Command $Command -ErrorAction Stop) {
            return $true
        }
    }
    catch {
        return $false
    }
    finally {
        $ErrorActionPreference = $OldPreference
    }
}

function Backup-PathVariable {
    param ($currentPath)
    $backupPath = [System.IO.Path]::Combine([System.Environment]::GetFolderPath("Desktop"), "PathBackup.txt")
    [System.IO.File]::WriteAllText($backupPath, $currentPath)
    Write-Host "Current PATH environment variable backed up to: $backupPath"
}

function Remove-PathFromEnvironment {
    param ($directoryToRemove, $currentPath, $protectedPaths)
    if ($currentPath -split ";" -contains $directoryToRemove) {
        if ($protectedPaths -notcontains $directoryToRemove) {
            Write-Host "Removing path from system environment variable PATH: $directoryToRemove"
            $newPath = ($currentPath -split ";" | Where-Object { $_ -ne $directoryToRemove }) -join ";"
            [System.Environment]::SetEnvironmentVariable("PATH", $newPath, "Machine")
            Write-Host "Path successfully removed from system environment variable PATH."
        }
        else {
            Write-Host "Path is in the protected paths list, not removing: $directoryToRemove"
        }
    }
    else {
        Write-Host "Path is not in the system environment variable PATH, no need to remove: $directoryToRemove"
    }
}

function Finish {
    Clear-Host
}

$pwsh = if (Test-CommandExist "pwsh.exe") { "pwsh.exe" } else { "powershell.exe" }

if (-not (Test-Administrator)) {
    Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy Bypass -Force
    $Proc = Start-Process -PassThru -Verb RunAs $pwsh -Args "-ExecutionPolicy Bypass -Command Set-Location '$PSScriptRoot'; &'$PSCommandPath' EVAL"
    if ($Proc) {
        $Proc.WaitForExit()
    }
    if (-not $Proc -or $Proc.ExitCode -ne 0) {
        Write-Warning "Failed to launch start as Administrator`r`nPress any key to exit"
        $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    }
    exit
}
elseif (($args.Count -eq 1) -and ($args[0] -eq "EVAL")) {
    Start-Process $pwsh -NoNewWindow -Args "-ExecutionPolicy Bypass -Command Set-Location '$PSScriptRoot'; &'$PSCommandPath'"
    exit
}

$currentPath = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
$currentDirectory = (Get-Location).Path.TrimEnd('\')
$binFolder = Join-Path -Path $currentDirectory -ChildPath "bin"

Backup-PathVariable -currentPath $currentPath

$protectedPaths = @(
    "C:\Windows\System32",
    "C:\Windows",
    "C:\Windows\System32\Wbem",
    "C:\Windows\System32\WindowsPowerShell\v1.0",
    "C:\Windows\System32\WindowsPowerShell\v2.0"
)

$directoriesToRemove = @()
if (Test-Path -Path $binFolder -PathType Container) {
    $directoriesToRemove += $binFolder
}
$directoriesToRemove += $currentDirectory

foreach ($directory in $directoriesToRemove) {
    Remove-PathFromEnvironment -directoryToRemove $directory -currentPath $currentPath -protectedPaths $protectedPaths
}

Write-Host "Current system PATH environment variable:"
[System.Environment]::GetEnvironmentVariable("PATH", "Machine")

Write-Output "Script execution completed!`r`nPress any key to exit."
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')

Finish
