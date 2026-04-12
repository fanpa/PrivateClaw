# OCR (Optical Character Recognition)

이미지 파일에서 텍스트를 추출하는 스킬입니다. 외부 OCR API를 사용합니다.

## 사전 준비

사용자에게 OCR API 정보를 확인합니다:
1. **API Endpoint URL** (예: `https://ocr-api.company.com/v1/ocr`)
2. **인증 방식** (API Key, Bearer Token 등 — config의 defaultHeaders에 설정되어 있을 수 있음)
3. **요청 형식** (multipart/form-data 또는 base64 JSON)

## Workflow

### 방식 1: multipart/form-data (파일 직접 업로드)

1. 사용자에게 OCR API endpoint URL을 확인합니다.

2. 이미지 파일을 OCR API에 업로드합니다:
```json
api_call: {
  "url": "OCR_API_ENDPOINT",
  "method": "POST",
  "formData": {
    "fields": {},
    "files": [
      { "fieldName": "image", "filePath": "IMAGE_FILE_PATH" }
    ]
  }
}
```

3. 응답에서 추출된 텍스트를 확인하고 사용자에게 전달합니다.

### 방식 2: base64 JSON (이미지를 base64 인코딩하여 전송)

1. 이미지를 base64로 인코딩합니다:
```
shell_exec: [Convert]::ToBase64String([IO.File]::ReadAllBytes('IMAGE_FILE_PATH'))
```
macOS/Linux의 경우:
```
shell_exec: base64 -i IMAGE_FILE_PATH
```

2. base64 데이터를 OCR API에 전송합니다:
```json
api_call: {
  "url": "OCR_API_ENDPOINT",
  "method": "POST",
  "headers": { "Content-Type": "application/json" },
  "body": "{\"image\": \"BASE64_DATA\"}"
}
```

3. 응답에서 추출된 텍스트를 확인하고 사용자에게 전달합니다.

### 방식 3: Google Cloud Vision API

1. Google Cloud Vision API를 사용하는 경우:
```json
api_call: {
  "url": "https://vision.googleapis.com/v1/images:annotate?key=API_KEY",
  "method": "POST",
  "headers": { "Content-Type": "application/json" },
  "body": "{\"requests\": [{\"image\": {\"content\": \"BASE64_DATA\"}, \"features\": [{\"type\": \"TEXT_DETECTION\"}]}]}"
}
```

2. 응답의 `responses[0].textAnnotations[0].description`에서 전체 텍스트를 추출합니다.

## 여러 이미지 일괄 처리

여러 이미지를 처리해야 하는 경우 (예: DRM 문서에서 추출한 이미지들):

1. 먼저 이미지 목록을 확인합니다:
```
shell_exec: ls $env:TEMP\privateclaw_images\
```
macOS/Linux:
```
shell_exec: ls /tmp/privateclaw_images/
```

2. 각 이미지에 대해 OCR을 수행합니다.

3. 모든 결과를 통합하여 사용자에게 전달합니다.

## 주의사항

- OCR API endpoint는 반드시 `allowedDomains`에 등록되어 있어야 합니다.
- 인증이 필요한 경우 `defaultHeaders`에 API 키를 미리 설정하세요.
- 대용량 이미지는 API 요청 크기 제한에 걸릴 수 있습니다. 필요시 이미지를 리사이즈하세요.
- OCR API의 응답 형식은 서비스마다 다릅니다. 응답을 확인하고 적절히 파싱하세요.
