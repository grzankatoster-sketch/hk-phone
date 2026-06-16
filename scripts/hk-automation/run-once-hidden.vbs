Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
runner = fso.BuildPath(scriptDir, "run-once.cmd")

exitCode = shell.Run("""" & runner & """", 0, True)
WScript.Quit exitCode
