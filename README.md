# PrivateClaw

이 프로젝트는 Openclaw와 같은 역할을 하는 Agent를 개발하는 프로젝트입니다. OpenAI 혹은 AnthropicAI compatible LLM의 Endpoint만 연결하면 바로 agent와 대화를 할 수 있습니다.

## 주요 기능

### Skills (MD 기반 워크플로우)

마크다운 기반 스킬 시스템을 통해 LLM의 동작을 커스터마이즈할 수 있습니다. `skills/<name>/skill.md` 파일에 워크플로우를 작성하고, config에 등록하면 LLM이 `use_skill` 도구로 스킬을 로드하여 지시에 따라 동작합니다.

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

### Tool 시스템

7개의 빌트인 도구를 제공합니다:

| 도구 | 설명 |
|------|------|
| `file_read` | 파일 내용 읽기 |
| `file_write` | 파일 내용 쓰기 (디렉토리 자동 생성) |
| `shell_exec` | 쉘 명령어 실행 (Windows/Mac/Linux 호환) |
| `web_fetch` | URL의 내용을 가져오기 (도메인 화이트리스트 적용) |
| `api_call` | HTTP API 호출 — GET, POST, PATCH, PUT, DELETE 지원 (도메인 화이트리스트 적용) |
| `use_skill` | 등록된 스킬 문서를 로드하여 워크플로우 지시를 따름 |
| `create_skill` | 대화를 통해 새로운 스킬을 생성하고 config에 자동 등록 |

### Tool 실행 승인 시스템

모든 도구 실행 전에 사용자 승인을 요구합니다:

```
⚠ Tool "shell_exec" wants to execute:
{"command":"ls -l"}
  [y] Allow once  [a] Allow always  [n] Deny
```

- `y` — 1회만 허용 (다음 호출 시 다시 물어봄)
- `a` — 해당 도구를 영구적으로 허용
- `n` — 거절, 에이전트 즉시 중단 후 입력 대기로 복귀

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

SQLite 기반 세션 저장 및 복원 기능을 제공합니다. 이전 대화를 이어서 진행할 수 있습니다.

토큰 사용량 최적화를 위해 sliding window 방식으로 최근 N개의 메시지만 LLM에 전송합니다:

```json
{
  "session": {
    "maxHistoryMessages": 20
  }
}
```

- **maxHistoryMessages** (기본값: 20): LLM에 전송할 최대 메시지 수. 0이면 제한 없음.
- 오래된 대화 이력이 자동으로 제거되어 토큰 비용 절감 및 이전 실패 기록에 의한 LLM 고착 방지.
- `/clear` 명령어로 대화 이력을 즉시 초기화할 수 있습니다.

### 멀티 프로바이더 지원

OpenAI, Anthropic, Ollama를 지원합니다. OpenAI/Anthropic compatible API를 제공하는 어떤 엔드포인트든 연결 가능합니다. Chat Completions API를 사용하므로 대부분의 호환 서버(vLLM 등)에서 동작합니다.

### 폐쇄망(Air-gapped) 지원

외부 인터넷 연결 없이 완전히 격리된 네트워크 환경에서도 동작합니다. 모든 LLM 연결은 사용자가 지정한 내부 엔드포인트(`baseURL`)로 직접 통신하며, 외부 서비스(Vercel Gateway 등)를 경유하지 않습니다.

## 구현 예정 기능

아래 기능은 아직 구현되지 않았으며, 향후 추가될 예정입니다.

### MCP 연동 (예정)

MCP(Model Context Protocol) 서버 연동을 통해 외부 도구와의 통합 지원.

### Sandbox 실행 환경 (예정)

Agent가 코드를 실행할 때 격리된 샌드박스(Docker 컨테이너) 환경에서 동작하여 호스트 시스템을 보호. 현재는 `shell_exec`가 호스트에서 직접 실행되며, Tool 승인 시스템으로 위험한 명령을 사전에 차단할 수 있습니다.

### 플러그인 아키텍처 (예정)

Skill 시스템을 확장하여 커뮤니티 플러그인 생태계 지원.

### Standalone 바이너리 배포 (예정)

Node.js 설치 없이 실행 가능한 단독 바이너리 배포. Bun의 크로스 컴파일(`--target`)을 활용하여 Windows/Mac/Linux 바이너리를 한번에 생성.

## 설치 및 실행

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

지원되는 프로바이더 타입: `openai`, `anthropic`, `ollama`

> **주의:** `allowedDomains`를 설정하는 경우, LLM 프로바이더의 도메인(예: `localhost`)도 반드시 포함해야 합니다. 미포함 시 LLM 연결이 차단됩니다.

### 빌드 및 PATH 등록

```bash
pnpm setup    # pnpm 글로벌 bin 디렉토리 설정 (최초 1회)
source ~/.zshrc  # 또는 source ~/.bashrc

pnpm run setup   # 빌드 + 글로벌 링크
```

이후 어디서든 `privateclaw` 명령어로 실행할 수 있습니다:

```bash
privateclaw chat                    # 새 대화 시작
privateclaw chat -s <session-id>    # 이전 세션 이어서 대화
privateclaw sessions                # 저장된 세션 목록 보기
privateclaw domains                 # 허용된 도메인 목록 조회
privateclaw run -p "프롬프트"        # 비대화형 단일 실행
privateclaw run -s skill-name       # 스킬 기반 실행
```

### 채팅 내 명령어

대화 중 사용할 수 있는 슬래시 명령어:

| 명령어 | 설명 |
|--------|------|
| `/help` | 사용 가능한 명령어 목록 표시 |
| `/domains` | 현재 허용된 도메인 목록 조회 |
| `/reload` | config 파일을 다시 읽어 설정 반영 (재시작 불필요) |
| `/clear` | 대화 이력 초기화 (새로운 컨텍스트에서 시작) |
| `/quit` | 대화 종료 |

`privateclaw.config.json`을 수정한 경우 (예: 도메인 추가, 프로바이더 변경, 스킬 등록), 채팅 중 `/reload`를 입력하면 재시작 없이 즉시 반영됩니다.

### 비대화형 실행 (Headless Mode)

`privateclaw run` 명령어로 대화 없이 단일 작업을 실행하고 결과를 stdout으로 출력합니다. 모든 도구는 자동 승인됩니다.

```bash
# 프롬프트 기반 실행
privateclaw run -p "현재 시스템 상태를 확인해줘"

# 스킬 기반 실행
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
| 세션 저장 | SQLite (`better-sqlite3`) | 로컬 저장소 |
| 스키마 | Zod | 타입 안전한 설정/도구 정의 |
| 테스트 | Vitest | 85개 단위 테스트 |
| 패키지 관리 | pnpm | |
