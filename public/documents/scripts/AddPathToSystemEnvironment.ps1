# Copyright (c) LetsShareAll Team.
# Licensed under the MIT License.

#####################################################################################################
#
# 将当前路径或其下的二进制文件夹写入系统环境变量。
#
# 此脚本将当前目录或其下的 'bin' 子目录（如果存在）添加到系统环境变量 PATH 中，
# 允许用户通过终端直接调用该目录下的可执行文件。
#
# 假设：
#     1. 可执行文件在当前目录或其子目录中。
#
#####################################################################################################

<#
.SYNOPSIS
    将当前路径或其下的二进制文件夹写入系统环境变量。

.DESCRIPTION
    此脚本将当前目录或其下的 'bin' 子目录（如果存在）添加到系统环境变量 PATH 中，
    允许用户通过终端直接调用该目录下的可执行文件。

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
    .\AddPathToSystemEnvironment.ps1
    如果当前目录或 'bin' 子目录存在，则将其添加到系统环境变量 PATH 中。
#>

$Host.UI.RawUI.WindowTitle = "Adding current directory or its 'bin' subdirectory to system environment variable..."

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

function Add-PathToEnvironment {
    param ($directoryToAdd, $currentPath)
    if (-not ($currentPath -split ";" -contains $directoryToAdd)) {
        $newPath = $currentPath + ";" + $directoryToAdd
        [System.Environment]::SetEnvironmentVariable("PATH", $newPath, "Machine")
        Write-Host "Path successfully added to the system environment variable PATH. Please restart the terminal to apply the changes."
    }
    else {
        Write-Host "Path is already in the system environment variable PATH. No need to add."
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
$directoryToAdd = if (Test-Path -Path $binFolder -PathType Container) { $binFolder } else { $currentDirectory }

Write-Host "Adding path to system environment variable PATH: $directoryToAdd"

try {
    Add-PathToEnvironment -directoryToAdd $directoryToAdd -currentPath $currentPath
    Write-Host "Current system PATH environment variable:"
    [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
}
catch {
    Write-Host "Error occurred: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Output "Script execution completed!`r`nPress any key to exit."
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')

Finish
