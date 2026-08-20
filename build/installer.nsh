!macro customInstall
  ; Keep an explicit uninstall entry next to the app shortcut. Windows Settings
  ; remains the canonical uninstall path, but this makes removal discoverable.
  CreateDirectory "$SMPROGRAMS\Asyncat"
  CreateShortCut "$SMPROGRAMS\Asyncat\Uninstall Asyncat.lnk" "$INSTDIR\Uninstall Asyncat.exe"
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\Asyncat\Uninstall Asyncat.lnk"
  RMDir "$SMPROGRAMS\Asyncat"

  ; Silent removals preserve user data. Interactive removals offer an explicit,
  ; opt-in clean uninstall without deleting attached Project folders elsewhere.
  IfSilent keepUserData
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Also remove Asyncat's local conversations, settings, browser data, models, and logs?$\r$\n$\r$\nAttached Project folders stored outside Asyncat's local data folder are not removed. This local-data deletion cannot be undone." \
    IDNO keepUserData
  RMDir /r "$APPDATA\Asyncat"
  RMDir /r "$LOCALAPPDATA\asyncat-oss-updater"

keepUserData:
!macroend
