; 설치·제거 때 탐색기 우클릭 "MD로 변환" 메뉴를 등록·해제한다(전체 사용자 설치면 HKLM, 현재 사용자면 HKCU = SHCTX)
!macro DcMenuAdd EXT
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\${EXT}\shell\DocConverterMd" "" "MD로 변환"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\${EXT}\shell\DocConverterMd" "Icon" '"$INSTDIR\DocConverter.exe",0'
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\${EXT}\shell\DocConverterMd\command" "" '"$INSTDIR\DocConverter.exe" --to-md "%1"'
!macroend

!macro DcMenuDel EXT
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\${EXT}\shell\DocConverterMd"
!macroend

!macro customInstall
  !insertmacro DcMenuAdd ".hwp"
  !insertmacro DcMenuAdd ".hwpx"
  !insertmacro DcMenuAdd ".pdf"
  !insertmacro DcMenuAdd ".docx"
  !insertmacro DcMenuAdd ".xlsx"
!macroend

!macro customUnInstall
  !insertmacro DcMenuDel ".hwp"
  !insertmacro DcMenuDel ".hwpx"
  !insertmacro DcMenuDel ".pdf"
  !insertmacro DcMenuDel ".docx"
  !insertmacro DcMenuDel ".xlsx"
!macroend
