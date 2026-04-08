# File Upload API

파일을 포함한 멀티파트 폼 데이터(multipart/form-data)로 API를 호출하는 스킬입니다.

## 언제 사용하나

- API 요청 body에 파일(이미지, PDF, CSV 등)과 JSON 데이터를 함께 전송해야 할 때
- `Content-Type: application/json` 대신 `multipart/form-data`가 필요한 엔드포인트를 호출할 때

## 핵심 원칙

- `api_call` 도구의 `formData` 파라미터를 사용한다. `body`와 `formData`를 동시에 지정하면 `formData`가 우선한다.
- `Content-Type` 헤더는 **절대 직접 설정하지 않는다**. fetch가 `multipart/form-data; boundary=...`를 자동으로 설정한다.
- 파일 경로(`filePath`)는 반드시 절대 경로여야 한다.
- `fileName`을 생략하면 `filePath`의 파일명이 자동으로 사용된다.
- `mimeType`을 생략하면 확장자로부터 자동 추론된다.

## Workflow

1. 사용자에게 업로드할 파일 경로와 함께 전송할 데이터(payload)를 확인합니다.
2. 전송할 JSON 데이터가 있으면 `formData.fields.data`에 `JSON.stringify`한 문자열로 넣습니다.
3. 파일은 `formData.files` 배열에 `fieldName`, `filePath`, 필요시 `fileName`과 `mimeType`을 지정합니다.
4. `api_call` 도구를 호출합니다.
5. 응답 status와 body를 확인하여 결과를 사용자에게 알립니다.

## 도구 호출 예시

다음 상황을 가정합니다:
- 엔드포인트: `https://internal.corp.com/api/documents/upload`
- 함께 전송할 메타데이터: `{ "category": "contract", "year": 2026 }`
- 업로드할 파일: `/Users/taeji/Documents/contract.pdf`

```json
{
  "url": "https://internal.corp.com/api/documents/upload",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer your-api-token"
  },
  "formData": {
    "fields": {
      "data": "{\"category\":\"contract\",\"year\":2026}"
    },
    "files": [
      {
        "fieldName": "files",
        "filePath": "/Users/taeji/Documents/contract.pdf",
        "fileName": "contract.pdf",
        "mimeType": "application/pdf"
      }
    ]
  }
}
```

여러 파일을 동시에 올려야 한다면 `files` 배열에 항목을 추가합니다:

```json
{
  "files": [
    {
      "fieldName": "files",
      "filePath": "/Users/taeji/Documents/contract.pdf"
    },
    {
      "fieldName": "files",
      "filePath": "/Users/taeji/Documents/appendix.docx"
    }
  ]
}
```

## 주의사항

- 파일이 존재하지 않으면 `TOOL FAILED` 에러가 반환된다. 호출 전에 경로를 반드시 확인한다.
- 바이너리 파일(이미지, PDF 등)은 `body`(string)로는 전송할 수 없다. 반드시 `formData.files`를 사용한다.
- 서버가 필드명에 민감할 수 있으므로(예: `file` vs `files`) 사용자에게 API 스펙을 확인한다.
