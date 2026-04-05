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

6개의 빌트인 도구를 제공합니다:

| 도구 | 설명 |
|------|------|
| `file_read` | 파일 내용 읽기 |
| `file_write` | 파일 내용 쓰기 (디렉토리 자동 생성) |
| `bash_exec` | Bash 명령어 실행 |
| `web_fetch` | URL의 내용을 가져오기 (도메인 화이트리스트 적용) |
| `api_call` | HTTP API 호출 — GET, POST, PATCH, PUT, DELETE 지원 (도메인 화이트리스트 적용) |
| `use_skill` | 등록된 스킬 문서를 로드하여 워크플로우 지시를 따름 |

### Tool 실행 승인 시스템

모든 도구 실행 전에 사용자 승인을 요구합니다:

```
⚠ Tool "bash_exec" wants to execute:
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

### 대화 기록 관리

SQLite 기반 세션 저장 및 복원 기능을 제공합니다. 이전 대화를 이어서 진행할 수 있습니다.

### 멀티 프로바이더 지원

OpenAI, Anthropic, Ollama를 지원합니다. OpenAI/Anthropic compatible API를 제공하는 어떤 엔드포인트든 연결 가능합니다. Chat Completions API를 사용하므로 대부분의 호환 서버(vLLM 등)에서 동작합니다.

### 폐쇄망(Air-gapped) 지원

외부 인터넷 연결 없이 완전히 격리된 네트워크 환경에서도 동작합니다. 모든 LLM 연결은 사용자가 지정한 내부 엔드포인트(`baseURL`)로 직접 통신하며, 외부 서비스(Vercel Gateway 등)를 경유하지 않습니다.

## 구현 예정 기능

아래 기능은 아직 구현되지 않았으며, 향후 추가될 예정입니다.

### MCP 연동 (예정)

MCP(Model Context Protocol) 서버 연동을 통해 외부 도구와의 통합 지원.

### Sandbox 실행 환경 (예정)

Agent가 코드를 실행할 때 격리된 샌드박스(Docker 컨테이너) 환경에서 동작하여 호스트 시스템을 보호. 현재는 `bash_exec`가 호스트에서 직접 실행되며, Tool 승인 시스템으로 위험한 명령을 사전에 차단할 수 있습니다.

### 플러그인 아키텍처 (예정)

Skill 시스템을 확장하여 커뮤니티 플러그인 생태계 지원.

## 설치 및 실행

### 요구사항

- Node.js 22 이상
- pnpm (`npm install -g pnpm`)

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
    "model": "llama3.2"
  },
  "security": {
    "allowedDomains": ["localhost"],
    "defaultHeaders": {}
  }
}
```

지원되는 프로바이더 타입: `openai`, `anthropic`, `ollama`

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
```

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
| 테스트 | Vitest | 81개 단위 테스트 |
| 패키지 관리 | pnpm | |
