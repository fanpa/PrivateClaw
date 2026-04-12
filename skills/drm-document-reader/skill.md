# DRM Document Reader

DRM이 적용된 Excel, PowerPoint, Word 문서를 Windows PowerShell COM Automation으로 읽는 스킬입니다.
Office 애플리케이션이 백그라운드에서 실행되어 DRM 에이전트가 복호화를 허용합니다.

> **주의:** Windows에서만 동작합니다. Microsoft Office가 설치되어 있어야 합니다.

## Workflow

### Excel (.xlsx, .xls)

1. 먼저 시트 목록을 조회합니다:
```
shell_exec: $excel = New-Object -ComObject Excel.Application; $excel.Visible = $false; $excel.DisplayAlerts = $false; $wb = $excel.Workbooks.Open('FILE_PATH'); $wb.Sheets | ForEach-Object { $_.Name }; $wb.Close($false); $excel.Quit(); [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
```

2. 사용자에게 시트 목록을 보여주고 어떤 시트를 읽을지 확인합니다.

3. 선택된 시트의 데이터를 읽습니다:
```
shell_exec: $excel = New-Object -ComObject Excel.Application; $excel.Visible = $false; $excel.DisplayAlerts = $false; $wb = $excel.Workbooks.Open('FILE_PATH'); $sheet = $wb.Sheets.Item('SHEET_NAME'); $rows = $sheet.UsedRange.Rows.Count; $cols = $sheet.UsedRange.Columns.Count; $result = @(); for ($r = 1; $r -le [Math]::Min($rows, 100); $r++) { $row = @(); for ($c = 1; $c -le $cols; $c++) { $row += $sheet.Cells.Item($r, $c).Text }; $result += ($row -join '`t') }; $result -join '`n'; $wb.Close($false); $excel.Quit(); [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
```

4. 100행을 초과하는 경우, 사용자에게 추가 데이터가 필요한지 확인 후 범위를 지정하여 추가로 읽습니다.

### PowerPoint (.pptx, .ppt)

1. 먼저 슬라이드 수를 확인합니다:
```
shell_exec: $ppt = New-Object -ComObject PowerPoint.Application; $pres = $ppt.Presentations.Open('FILE_PATH', $true, $false, $false); Write-Output "Slides: $($pres.Slides.Count)"; $pres.Close(); $ppt.Quit(); [System.Runtime.Interopservices.Marshal]::ReleaseComObject($ppt) | Out-Null
```

2. 슬라이드의 텍스트를 추출합니다 (범위 지정 가능):
```
shell_exec: $ppt = New-Object -ComObject PowerPoint.Application; $pres = $ppt.Presentations.Open('FILE_PATH', $true, $false, $false); for ($i = 1; $i -le [Math]::Min($pres.Slides.Count, 20); $i++) { Write-Output "--- Slide $i ---"; $pres.Slides[$i].Shapes | ForEach-Object { if ($_.HasTextFrame) { $_.TextFrame.TextRange.Text } } }; $pres.Close(); $ppt.Quit(); [System.Runtime.Interopservices.Marshal]::ReleaseComObject($ppt) | Out-Null
```

### Word (.docx, .doc)

1. 문서 텍스트를 읽습니다:
```
shell_exec: $word = New-Object -ComObject Word.Application; $word.Visible = $false; $doc = $word.Documents.Open('FILE_PATH', $false, $true); $text = $doc.Content.Text; if ($text.Length -gt 5000) { $text.Substring(0, 5000) + '... [truncated]' } else { $text }; $doc.Close($false); $word.Quit(); [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
```

### 이미지 추출

문서에 포함된 이미지를 임시 폴더에 저장할 수 있습니다. 추출된 이미지는 OCR 스킬과 연계하여 텍스트로 변환할 수 있습니다.

**Excel 이미지 추출:**
```
shell_exec: $excel = New-Object -ComObject Excel.Application; $excel.Visible = $false; $excel.DisplayAlerts = $false; $wb = $excel.Workbooks.Open('FILE_PATH'); $sheet = $wb.Sheets.Item('SHEET_NAME'); $dir = "$env:TEMP\privateclaw_images"; New-Item -ItemType Directory -Force -Path $dir | Out-Null; $i = 1; $sheet.Shapes | ForEach-Object { $_.CopyPicture(); $img = New-Object -ComObject Word.Application; $img.Visible = $false; $_.Copy(); $path = "$dir\excel_img_$i.png"; $i++ }; Write-Output "Images saved to: $dir"; $wb.Close($false); $excel.Quit(); [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
```

**PPT 이미지 추출:**
```
shell_exec: $ppt = New-Object -ComObject PowerPoint.Application; $pres = $ppt.Presentations.Open('FILE_PATH', $true, $false, $false); $dir = "$env:TEMP\privateclaw_images"; New-Item -ItemType Directory -Force -Path $dir | Out-Null; $i = 1; foreach ($slide in $pres.Slides) { foreach ($shape in $slide.Shapes) { if ($shape.Type -eq 13) { $path = "$dir\slide$($slide.SlideIndex)_img$i.png"; $shape.Export($path, 2); Write-Output "Exported: $path"; $i++ } } }; $pres.Close(); $ppt.Quit(); [System.Runtime.Interopservices.Marshal]::ReleaseComObject($ppt) | Out-Null
```

추출된 이미지 경로를 사용자에게 알려주세요. 이미지 내용을 분석해야 하는 경우 `ocr` 스킬을 사용하여 텍스트로 변환할 수 있습니다.

## 주의사항

- FILE_PATH는 반드시 절대 경로를 사용하세요 (예: `C:\Users\user\Documents\report.xlsx`)
- COM 객체는 반드시 `ReleaseComObject`로 해제하세요. 누락 시 Office 프로세스가 남습니다.
- 대용량 파일은 메모리 부담을 줄이기 위해 범위를 지정하여 단계적으로 읽으세요.
- DRM 에이전트가 설치된 환경에서만 DRM 문서를 열 수 있습니다.
