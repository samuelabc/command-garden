#define MyAppName "commandGarden"
#define MyAppVersion GetEnv('CG_VERSION')
#if MyAppVersion == ""
  #define MyAppVersion "3.1.0"
#endif
#define MyAppPublisher "commandGarden"
#define MyAppURL "https://github.com/samuelabc/command-garden"

[Setup]
AppId={{B8E3F2A1-4C5D-6E7F-8A9B-0C1D2E3F4A5B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={localappdata}\{#MyAppName}
DefaultGroupName={#MyAppName}
ArchitecturesAllowed=x64compatible
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=commandGarden-{#MyAppVersion}-x64-setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ChangesEnvironment=yes
#ifexist "..\dist\win-x64\commandGarden\commandgarden.ico"
SetupIconFile=..\dist\win-x64\commandGarden\commandgarden.ico
UninstallDisplayIcon={app}\commandgarden.ico
#endif

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\dist\win-x64\commandGarden\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\commandGarden"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launcher\commandgarden.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\commandgarden.ico"; Comment: "Start commandGarden"
Name: "{group}\Uninstall commandGarden"; Filename: "{uninstallexe}"

[Registry]
Root: HKCU; Subkey: "Environment"; ValueType: expandsz; ValueName: "Path"; ValueData: "{olddata};{app}\bin"; Check: NeedsAddPath(ExpandConstant('{app}\bin'))

[Run]
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launcher\commandgarden.ps1"""; Description: "Launch commandGarden"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{app}\bin\cg.cmd"; Parameters: "down"; Flags: runhidden waituntilterminated; RunOnceId: "StopServices"

[Code]
function NeedsAddPath(Param: string): Boolean;
var
  OrigPath: string;
begin
  if not RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', OrigPath) then
  begin
    Result := True;
    exit;
  end;
  Result := Pos(';' + Uppercase(Param) + ';', ';' + Uppercase(OrigPath) + ';') = 0;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  OrigPath, AppBinDir, NewPath: string;
  P: Integer;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    if RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', OrigPath) then
    begin
      AppBinDir := ExpandConstant('{app}\bin');
      P := Pos(';' + Uppercase(AppBinDir), ';' + Uppercase(OrigPath));
      if P > 0 then
      begin
        NewPath := Copy(OrigPath, 1, P - 1) + Copy(OrigPath, P + Length(AppBinDir) + 1, MaxInt);
        while (Length(NewPath) > 0) and (NewPath[1] = ';') do
          NewPath := Copy(NewPath, 2, MaxInt);
        while (Length(NewPath) > 0) and (NewPath[Length(NewPath)] = ';') do
          NewPath := Copy(NewPath, 1, Length(NewPath) - 1);
        while Pos(';;', NewPath) > 0 do
          StringChangeEx(NewPath, ';;', ';', True);
        RegWriteStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', NewPath);
      end;
    end;
  end;
end;
