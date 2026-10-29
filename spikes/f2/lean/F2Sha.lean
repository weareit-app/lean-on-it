/- F2 spike, NON-PRODUCTION. Prints the SHA-256 of each file, to check `F2.Sha256`. -/
import F2.Sha256
def main (args : List String) : IO Unit := do
  for p in args do IO.println s!"{F2.Sha256.hex (← IO.FS.readBinFile p)}  {p}"
