; Inno Setup script for the CaptionForge Windows installer.
; Built by scripts/package.mjs (ISCC /DAppVersion=... /DSourceDir=... /DOutputDir=...).
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{DC6452B3-2B6B-4B6E-BFBA-DF352F307436}
AppName=CaptionForge
AppVersion={#AppVersion}
AppPublisher=Trapzium Digital
DefaultDirName={localappdata}\Programs\CaptionForge
DefaultGroupName=CaptionForge
PrivilegesRequired=lowest
OutputDir={#OutputDir}
OutputBaseFilename=CaptionForge-{#AppVersion}-windows-x64-setup
Compression=lzma2/ultra64
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
SetupIconFile={#SourceDir}\CaptionForge.ico
UninstallDisplayIcon={app}\CaptionForge.ico
WizardStyle=modern

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\CaptionForge"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\CaptionForge.vbs"""; IconFilename: "{app}\CaptionForge.ico"
Name: "{userdesktop}\CaptionForge"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\CaptionForge.vbs"""; IconFilename: "{app}\CaptionForge.ico"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"

[Run]
Filename: "{sys}\wscript.exe"; Parameters: """{app}\CaptionForge.vbs"""; Description: "Start CaptionForge"; Flags: postinstall nowait skipifsilent
