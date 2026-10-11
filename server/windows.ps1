$ErrorActionPreference = 'Stop'
$argsData = $env:ORBIT_ARGUMENTS | ConvertFrom-Json
$action = $env:ORBIT_ACTION
function Emit($value) { ConvertTo-Json -InputObject $value -Compress -Depth 8 }
switch ($action) {
 'list_apps' { Emit @(Get-StartApps | Select-Object Name, AppID); exit }
 'open_app' { Start-Process explorer.exe -ArgumentList ('shell:AppsFolder\' + $argsData.id); Emit @{opened=$argsData.id}; exit }
 'open_url' { Start-Process -FilePath $argsData.url; Emit @{opened=$argsData.url}; exit }
 'open_file' { Start-Process -FilePath $argsData.path; Emit @{opened=$argsData.path}; exit }
 'get_volume' { }
 'set_volume' { }
 'media_control' { }
 'notify' {
  Add-Type -AssemblyName System.Windows.Forms
  $n=New-Object System.Windows.Forms.NotifyIcon
  $n.Icon=[System.Drawing.SystemIcons]::Information; $n.Visible=$true
  $n.ShowBalloonTip(8000,'Orbit',$argsData.title,[System.Windows.Forms.ToolTipIcon]::Info)
  Start-Sleep -Seconds 8; $n.Dispose(); Emit @{ok=$true}; exit
 }
 default { throw 'Unsupported computer action.' }
}
if ($action -eq 'get_volume' -or $action -eq 'set_volume') {
 Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class DeviceEnumerator {}
[ComImport,Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDeviceEnumerator {
 [PreserveSig] int EnumAudioEndpoints(int flow,int state,out IntPtr devices);
 [PreserveSig] int GetDefaultAudioEndpoint(int flow,int role,out IDevice device);
}
[ComImport,Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDevice {
 [PreserveSig] int Activate(ref Guid id,int context,IntPtr activation,[MarshalAs(UnmanagedType.IUnknown)] out object instance);
}
[ComImport,Guid("5CDF2C82-841E-4546-9722-0CF74078229A"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IEndpoint {
 [PreserveSig] int RegisterControlChangeNotify(IntPtr p); [PreserveSig] int UnregisterControlChangeNotify(IntPtr p); [PreserveSig] int GetChannelCount(out uint count);
 [PreserveSig] int SetMasterVolumeLevel(float value,ref Guid context); [PreserveSig] int SetMasterVolumeLevelScalar(float value,ref Guid context);
 [PreserveSig] int GetMasterVolumeLevel(out float value); [PreserveSig] int GetMasterVolumeLevelScalar(out float value);
}
public class OrbitVolume {
 static IEndpoint Endpoint() {
  IDevice device; var enumerator=(IDeviceEnumerator)new DeviceEnumerator(); Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0,1,out device));
  Guid id=typeof(IEndpoint).GUID; object endpoint; Marshal.ThrowExceptionForHR(device.Activate(ref id,23,IntPtr.Zero,out endpoint)); return (IEndpoint)endpoint;
 }
 public static int Get() { float value; Marshal.ThrowExceptionForHR(Endpoint().GetMasterVolumeLevelScalar(out value)); return (int)Math.Round(value*100); }
 public static void Set(int value) { Guid context=Guid.Empty; Marshal.ThrowExceptionForHR(Endpoint().SetMasterVolumeLevelScalar(value/100f,ref context)); }
}
'@
 if ($action -eq 'get_volume') { Emit ([OrbitVolume]::Get()) } else { [OrbitVolume]::Set([int]$argsData.volume); Emit @{volume=$argsData.volume} }
 exit
}
# Use the requested player's Windows media session, never global media keys.
if ($action -eq 'media_control') {
 Add-Type -AssemblyName System.Runtime.WindowsRuntime
 $null=[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
 function Await($operation,$resultType) {
  $method=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {$_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'} | Select-Object -First 1
  $task=$method.MakeGenericMethod($resultType).Invoke($null,@($operation)); $task.Wait(); return $task.Result
 }
 $manager=Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
 $pattern=if($argsData.app -eq 'Spotify'){'Spotify'}else{'ZuneMusic|AppleMusic|MediaPlayer'}
 $session=$manager.GetSessions() | Where-Object {$_.SourceAppUserModelId -match $pattern} | Select-Object -First 1
 if(!$session){throw ($argsData.app+' has no active media session. Start playback in that app first.')}
 $operation=switch($argsData.action){'play'{$session.TryPlayAsync()};'pause'{$session.TryPauseAsync()};'next'{$session.TrySkipNextAsync()};'previous'{$session.TrySkipPreviousAsync()}}
 $result=Await $operation ([bool]);if(!$result){throw 'The media player rejected that action.'}; Emit @{app=$argsData.app;action=$argsData.action}
}
