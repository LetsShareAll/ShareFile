# Copyright (c) LetsShareAll Team.
# Licensed under the MIT License.

#####################################################################################################
#
# 添加或拉取 pyenv-win 项目，并设置相关环境变量。
#
# 此脚本将当前目录或其下的 'pyenv-win' 项目（如果不存在，则克隆）到指定目录，并设置相关环境变量（PYENV、PYENV_ROOT、PYENV_HOME）。
#
# 假设：
#     1. Git 已经安装并能正常使用。
#     2. 需要管理员权限以修改系统环境变量。
#
#####################################################################################################

<#
.SYNOPSIS
    添加或拉取 pyenv-win 项目，并设置相关环境变量。

.DESCRIPTION
    此脚本用于在当前目录中添加或拉取 pyenv-win 项目，并设置相关环境变量（PYENV、PYENV_ROOT、PYENV_HOME）。
    如果当前目录已经包含名为 'pyenv-win' 的文件夹，则尝试拉取最新的代码更新。
    脚本需要管理员权限以修改系统环境变量。

.NOTES
    - 需要安装 Git，并且确保 PowerShell 可以以管理员权限运行。
    - 修改 PATH 后显示当前系统环境变量。
    - 如果已经存在 pyenv-win 文件夹，则尝试拉取最新代码；否则，克隆项目到当前目录。
    - 脚本执行后，请重启终端以使更改生效。

.AUTHOR
    Shuery
    Shuery@Lssa.Fun
    2024/07/01

.PARAMETER None
    不需要显式传递参数。脚本自动检测管理员权限和 PowerShell 可执行文件。

.EXAMPLE
    .\setup-pyenv.ps1
    在当前目录添加或拉取 pyenv-win 项目，并设置相关环境变量。
#>

$Host.UI.RawUI.WindowTitle = "Setting up pyenv environment..."

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
    try {
        $null = Get-Command $Command -ErrorAction Stop
        return $true
    }
    catch {
        return $false
    }
}

function Add-PathToEnvironment {
    param ($directoryToAdd, $currentEnvPath)
    try {
        if (-not ($currentEnvPath -split ";" -contains $directoryToAdd)) {
            $newPath = $currentEnvPath + ";" + $directoryToAdd
            [System.Environment]::SetEnvironmentVariable("PATH", $newPath, "Machine")
            Write-Host "Path added to the system environment variable PATH: $directoryToAdd"
        }
        else {
            Write-Host "Path is already in the system environment variable PATH. No need to add."
        }
    }
    catch {
        throw "Failed to add path to PATH: $_"
    }
}

function PullOrClonePyenvWin {
    param ($repoUrl, $targetDirectory)
    try {
        if (!(Test-Path -Path $targetDirectory -PathType Container)) {
            Write-Host "Cloning pyenv-win from $repoUrl to $targetDirectory..."
            git clone $repoUrl $targetDirectory
        }
        else {
            if ((Get-Item -Path $targetDirectory).Name -eq "PyEnv") {
                Write-Host "Pulling latest changes for pyenv-win in $targetDirectory..."
                Set-Location $targetDirectory
                git pull
            }
        }
    }
    catch {
        throw "Failed to pull or clone pyenv-win: $_"
    }
}

function SetupPyenvEnvironment {
    param ($pyenvPath)
    try {
        $pyenvDir = Join-Path -Path $pyenvPath -ChildPath "pyenv-win"
        [System.Environment]::SetEnvironmentVariable('PYENV', "$pyenvDir\", "Machine")
        [System.Environment]::SetEnvironmentVariable('PYENV_ROOT', "$pyenvDir\", "Machine")
        [System.Environment]::SetEnvironmentVariable('PYENV_HOME', "$pyenvDir\", "Machine")
    }
    catch {
        throw "Failed to setup pyenv environment: $_"
    }
}

function Finish {
    Clear-Host
}

$currentDirPath = (Get-Location).Path.TrimEnd('\')
$pyenvTargetDir = Join-Path -Path $currentDirPath -ChildPath "PyEnv"

$pwsh = if (Test-CommandExist "pwsh.exe") { "pwsh.exe" } else { "powershell.exe" }

if (-not (Test-Administrator)) {
    Write-Warning "Script requires Administrator privileges. Restarting script as Administrator..."
    Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy Bypass -Force
    $Proc = Start-Process -PassThru -Verb RunAs $pwsh -Args "-ExecutionPolicy Bypass -Command Set-Location '$currentDirPath'; &'$PSCommandPath' '$currentDirPath' '$pyenvTargetDir' EVAL"
    if ($Proc) {
        $Proc.WaitForExit()
    }
    if (-not $Proc -or $Proc.ExitCode -ne 0) {
        Write-Warning "Failed to launch as Administrator.`r`nPress any key to exit."
        $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    }
    exit
}
elseif (($args.Count -ge 3) -and ($args[2] -eq "EVAL")) {
    $currentDirPath = $args[0]
    $pyenvTargetDir = $args[1]
    Set-Location $currentDirPath
}

$currentEnvPath = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")

if (!(Test-Path -Path "$currentDirPath\PyEnv" -PathType Container)) {
    Write-Host "Setting up pyenv-win environment..."

    try {
        PullOrClonePyenvWin -repoUrl "https://github.com/pyenv-win/pyenv-win.git" -targetDirectory $pyenvTargetDir
        SetupPyenvEnvironment -pyenvPath $currentDirPath
        Add-PathToEnvironment -directoryToAdd "$currentDirPath\pyenv-win\shims" -currentEnvPath $currentEnvPath
        Add-PathToEnvironment -directoryToAdd "$currentDirPath\pyenv-win" -currentEnvPath $currentEnvPath

        Write-Host "Current system PATH environment variable:"
        [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
    }
    catch {
        WritError occurredst "Error occurred: $_" -ForegroundColor Red
    }
}

Write-Output "Script execution completed!`r`nPress any key to exit."
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')

Finish
