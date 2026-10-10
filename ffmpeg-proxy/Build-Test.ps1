$ErrorActionPreference = 'Stop'
Push-Location -LiteralPath $PSScriptRoot
try {
    $python = 'C:\ProgramData\anaconda3\python.exe'
    & $python prepare.py
    if ($LASTEXITCODE -ne 0) { throw 'Dependency preparation failed.' }
    $vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
    $vsInstall = (& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath | Select-Object -First 1)
    if (-not $vsInstall) { throw 'MSVC x64 tools were not found.' }
    cmake -S . -B build -G 'Visual Studio 17 2022' -A x64 "-DCMAKE_GENERATOR_INSTANCE=$vsInstall"
    if ($LASTEXITCODE -ne 0) { throw 'CMake configuration failed.' }
    cmake --build build --config Release
    if ($LASTEXITCODE -ne 0) { throw 'Compilation failed.' }
    & $python test_proxy.py
    if ($LASTEXITCODE -ne 0) { throw 'Isolated proxy tests failed.' }
} finally {
    Pop-Location
}
