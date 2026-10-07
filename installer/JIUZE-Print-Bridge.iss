; JIUZE Print Bridge Windows installer
#define MyAppName "JIUZE Print Bridge"
#define MyAppVersion "1.0.1"
#define MyAppPublisher "JIUZE Kenya"
#define MyAppExeName "JIUZE-Print-Bridge.exe"

[Setup]
AppId={{A2D6E1B0-8F8B-4A6A-9F3A-2D3C9C1E8A11}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\JIUZE Print Bridge
DefaultGroupName=JIUZE Print Bridge
OutputDir=output
OutputBaseFilename=JIUZE-Print-Bridge-Setup
Compression=lzma
SolidCompression=yes
PrivilegesRequired=lowest
WizardStyle=modern
Uninstallable=yes

[Files]
Source: "..\dist\JIUZE-Print-Bridge.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\print-bridge\print.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\print-bridge\config.json"; DestDir: "{app}"; Flags: onlyifdoesntexist

[Icons]
Name: "{userprograms}\JIUZE Print Bridge"; Filename: "{app}\JIUZE-Print-Bridge.exe"
Name: "{userdesktop}\JIUZE Print Bridge"; Filename: "{app}\JIUZE-Print-Bridge.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "JIUZE Print Bridge"; ValueData: """{app}\JIUZE-Print-Bridge.exe"""; Flags: uninsdeletevalue

[Run]
Filename: "{app}\JIUZE-Print-Bridge.exe"; Description: "Start JIUZE Print Bridge now"; Flags: nowait postinstall skipifsilent
