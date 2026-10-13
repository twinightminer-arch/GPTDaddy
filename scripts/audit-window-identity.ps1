param([int]$ProcessId)

$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class WindowAppIdentity {
  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  private struct PropertyKey { public Guid Format; public uint PropertyId; }

  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IPropertyStore {
    [PreserveSig] int GetCount(out uint count);
    [PreserveSig] int GetAt(uint index, out PropertyKey key);
    [PreserveSig] int GetValue(ref PropertyKey key, IntPtr value);
    [PreserveSig] int SetValue(ref PropertyKey key, IntPtr value);
    [PreserveSig] int Commit();
  }

  [DllImport("shell32.dll", PreserveSig = true)]
  private static extern int SHGetPropertyStoreForWindow(IntPtr window, ref Guid iid, out IPropertyStore store);
  [DllImport("ole32.dll")]
  private static extern int PropVariantClear(IntPtr value);

  public static string ReadAppUserModelId(IntPtr window) {
    Guid iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
    IPropertyStore store;
    int result = SHGetPropertyStoreForWindow(window, ref iid, out store);
    if (result < 0) Marshal.ThrowExceptionForHR(result);
    IntPtr value = Marshal.AllocCoTaskMem(24);
    try {
      for (int index = 0; index < 24; index++) Marshal.WriteByte(value, index, 0);
      PropertyKey key = new PropertyKey { Format = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), PropertyId = 5 };
      result = store.GetValue(ref key, value);
      if (result < 0) Marshal.ThrowExceptionForHR(result);
      ushort type = (ushort)Marshal.ReadInt16(value);
      if (type == 0) return null;
      if (type != 31) return "unexpected PROPVARIANT type " + type;
      IntPtr pointer = Marshal.ReadIntPtr(value, 8);
      return Marshal.PtrToStringUni(pointer);
    } finally {
      PropVariantClear(value);
      Marshal.FreeCoTaskMem(value);
      Marshal.ReleaseComObject(store);
    }
  }
}
'@

$process = Get-Process -Id $ProcessId -ErrorAction Stop
if ($process.MainWindowHandle -eq [IntPtr]::Zero) { throw 'The process has no main window.' }
[pscustomobject]@{
  ProcessId = $process.Id
  ExecutablePath = $process.Path
  MainWindowTitle = $process.MainWindowTitle
  MainWindowHandle = $process.MainWindowHandle.ToInt64()
  WindowAppUserModelId = [WindowAppIdentity]::ReadAppUserModelId($process.MainWindowHandle)
} | Format-List
