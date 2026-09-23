[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$Destination = "C:\Users\thaba\OneDrive\Documents\ThriveLens 2026\Training and Validation Model"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$DatasetName = "ThriveLens_OpenFood_FoodR1_Kaggle_300K.zip"
$NotebookName = "ThriveLens_FoodR1_Dual_T4_QLoRA.ipynb"
$BuilderRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BuilderPython = Join-Path $BuilderRoot "build_dataset_archive.py"
$VerifierPython = Join-Path $BuilderRoot "verify_thrivelens_300k.py"
$BundledNotebook = Join-Path $BuilderRoot "bundle_files\notebooks\$NotebookName"
$WorkRoot = Join-Path $env:LOCALAPPDATA "ThriveLens_300K_PC_Builder_Work"
$FruitsArchive = Join-Path $WorkRoot "fruits-360-100x100-main.zip"
$FruitsPartial = Join-Path $WorkRoot "fruits-360-100x100-main.zip.partial"
$TemporaryOutput = Join-Path $WorkRoot "$DatasetName.building"
$FinalOutput = Join-Path $Destination $DatasetName
$FinalNotebook = Join-Path $Destination $NotebookName
$LogPath = Join-Path $Destination "ThriveLens_300K_Build.log"
$FruitsUrl = "https://github.com/fruits-360/fruits-360-100x100/archive/refs/heads/main.zip"
$RequiredFreeBytes = 15GB

function Write-Stage {
    param([string]$Message)
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host $Message -ForegroundColor Cyan
    Write-Host "================================================================" -ForegroundColor Cyan
}

function Get-FreeBytes {
    param([string]$Path)
    $Root = [System.IO.Path]::GetPathRoot([System.IO.Path]::GetFullPath($Path))
    $DriveName = $Root.TrimEnd("\").TrimEnd(":")
    return (Get-PSDrive -Name $DriveName -ErrorAction Stop).Free
}

function Invoke-BasePython {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    if ($script:UsePythonLauncher) {
        & $script:BasePythonPath -3 @Arguments
    }
    else {
        & $script:BasePythonPath @Arguments
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Python failed with exit code $LASTEXITCODE."
    }
}

New-Item -ItemType Directory -Path $Destination -Force | Out-Null
New-Item -ItemType Directory -Path $WorkRoot -Force | Out-Null

Start-Transcript -LiteralPath $LogPath -Append | Out-Null
try {
    Write-Stage "THRIVELENS 300K PUBLIC-DATA DOWNLOADER AND BUILDER"
    Write-Host "Destination: $Destination"
    Write-Host "Final dataset: $FinalOutput"
    Write-Host "No account or sign-in is required."

    foreach ($RequiredPath in @($BuilderPython, $VerifierPython, $BundledNotebook)) {
        if (-not (Test-Path -LiteralPath $RequiredPath -PathType Leaf)) {
            throw "Builder package is incomplete. Missing: $RequiredPath"
        }
    }

    if (Test-Path -LiteralPath $FinalOutput -PathType Leaf) {
        Write-Stage "AN EXISTING DATASET ZIP WAS FOUND - VALIDATING IT"
        $PythonCommand = Get-Command py.exe -ErrorAction SilentlyContinue
        if ($null -ne $PythonCommand) {
            $script:UsePythonLauncher = $true
            $script:BasePythonPath = $PythonCommand.Source
        }
        else {
            $PythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
            if ($null -eq $PythonCommand) {
                throw "Python 3 is required. Install Python 3.11 or newer, then run this launcher again."
            }
            $script:UsePythonLauncher = $false
            $script:BasePythonPath = $PythonCommand.Source
        }
        Invoke-BasePython -Arguments @($VerifierPython, $FinalOutput)
        Copy-Item -LiteralPath $BundledNotebook -Destination $FinalNotebook -Force
        Write-Stage "READY - THE DATASET WAS ALREADY COMPLETE"
        Write-Host "Dataset: $FinalOutput" -ForegroundColor Green
        Write-Host "Notebook: $FinalNotebook" -ForegroundColor Green
        exit 0
    }

    $FreeBytes = Get-FreeBytes -Path $WorkRoot
    if ($FreeBytes -lt $RequiredFreeBytes) {
        $FreeGiB = [Math]::Round($FreeBytes / 1GB, 2)
        throw "At least 15 GB of free space is required on the build drive. Available: $FreeGiB GB."
    }

    Write-Stage "CHECKING PYTHON"
    $PythonCommand = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($null -ne $PythonCommand) {
        $script:UsePythonLauncher = $true
        $script:BasePythonPath = $PythonCommand.Source
    }
    else {
        $PythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
        if ($null -eq $PythonCommand) {
            throw "Python 3 is required. Install Python 3.11 or newer from https://www.python.org/downloads/windows/ and run this launcher again."
        }
        $script:UsePythonLauncher = $false
        $script:BasePythonPath = $PythonCommand.Source
    }

    Invoke-BasePython -Arguments @("-c", "import sys; assert sys.version_info >= (3, 11), 'Python 3.11 or newer is required'; print(sys.version)")

    $VenvRoot = Join-Path $WorkRoot "python-env"
    $VenvPython = Join-Path $VenvRoot "Scripts\python.exe"
    if (-not (Test-Path -LiteralPath $VenvPython -PathType Leaf)) {
        Write-Host "Creating an isolated Python environment..."
        Invoke-BasePython -Arguments @("-m", "venv", $VenvRoot)
    }

    & $VenvPython -m pip install --disable-pip-version-check --upgrade pip
    if ($LASTEXITCODE -ne 0) {
        throw "Could not prepare pip."
    }
    & $VenvPython -m pip install --disable-pip-version-check "requests>=2.32,<3" "Pillow>=10,<13" "urllib3>=2,<3"
    if ($LASTEXITCODE -ne 0) {
        throw "Could not install the Python download dependencies."
    }

    Write-Stage "DOWNLOADING THE OFFICIAL FRUITS-360 ARCHIVE"
    if (-not (Test-Path -LiteralPath $FruitsArchive -PathType Leaf)) {
        $CurlCommand = Get-Command curl.exe -ErrorAction SilentlyContinue
        if ($null -eq $CurlCommand) {
            throw "Windows curl.exe was not found. Update Windows or install curl, then run this launcher again."
        }
        & $CurlCommand.Source --location --fail --retry 10 --retry-delay 5 --continue-at - --output $FruitsPartial $FruitsUrl
        if ($LASTEXITCODE -ne 0) {
            throw "Fruits-360 download failed with exit code $LASTEXITCODE. Run the launcher again to resume."
        }
        Move-Item -LiteralPath $FruitsPartial -Destination $FruitsArchive
    }
    else {
        Write-Host "Using the existing Fruits-360 download: $FruitsArchive"
    }

    & $VenvPython -c "import sys,zipfile; p=sys.argv[1]; z=zipfile.ZipFile(p); assert any('/Training/' in n for n in z.namelist()), 'Training folder missing'; assert any('/Test/' in n for n in z.namelist()), 'Test folder missing'; print('Fruits-360 ZIP verified:', p)" $FruitsArchive
    if ($LASTEXITCODE -ne 0) {
        throw "The Fruits-360 archive is incomplete. Delete '$FruitsArchive' and run the launcher again."
    }

    if (Test-Path -LiteralPath $TemporaryOutput -PathType Leaf) {
        Remove-Item -LiteralPath $TemporaryOutput -Force
    }

    Write-Stage "BUILDING THE COMPLETE THRIVELENS DATASET"
    Write-Host "The builder will now download the public Open Images and Nutrition5k data."
    Write-Host "This is the long stage. Keep PowerShell open and keep the PC connected to the internet."
    $env:THRIVELENS_OUTPUT = $TemporaryOutput
    $env:THRIVELENS_FRUITS_ARCHIVE = $FruitsArchive

    & $VenvPython $BuilderPython
    if ($LASTEXITCODE -ne 0) {
        if (Test-Path -LiteralPath $TemporaryOutput -PathType Leaf) {
            Remove-Item -LiteralPath $TemporaryOutput -Force
        }
        throw "Dataset construction failed with exit code $LASTEXITCODE. The public source download is resumable where supported; run the launcher again."
    }

    Write-Stage "VALIDATING THE COMPLETE ZIP"
    & $VenvPython $VerifierPython $TemporaryOutput
    if ($LASTEXITCODE -ne 0) {
        throw "The completed ZIP did not pass validation. See: $LogPath"
    }

    Move-Item -LiteralPath $TemporaryOutput -Destination $FinalOutput
    $TemporaryReport = Join-Path $WorkRoot "ThriveLens_300K_BUILD_VERIFICATION.json"
    if (Test-Path -LiteralPath $TemporaryReport -PathType Leaf) {
        Move-Item -LiteralPath $TemporaryReport -Destination (Join-Path $Destination "ThriveLens_300K_BUILD_VERIFICATION.json") -Force
    }
    Copy-Item -LiteralPath $BundledNotebook -Destination $FinalNotebook -Force

    Write-Stage "READY - DOWNLOAD AND BUILD COMPLETED SUCCESSFULLY"
    Write-Host "Dataset: $FinalOutput" -ForegroundColor Green
    Write-Host "Notebook: $FinalNotebook" -ForegroundColor Green
    Write-Host "Verification: $(Join-Path $Destination 'ThriveLens_300K_BUILD_VERIFICATION.json')" -ForegroundColor Green
    Write-Host "Log: $LogPath" -ForegroundColor Green
    Write-Host "Do not extract the dataset ZIP before uploading it to Kaggle."
}
catch {
    Write-Host ""
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Full log: $LogPath" -ForegroundColor Yellow
    exit 1
}
finally {
    Remove-Item Env:\THRIVELENS_OUTPUT -ErrorAction SilentlyContinue
    Remove-Item Env:\THRIVELENS_FRUITS_ARCHIVE -ErrorAction SilentlyContinue
    Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
}
