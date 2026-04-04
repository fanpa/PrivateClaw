# PrivateClaw

이 프로젝트는 Openclaw와 같은 역할을 하는 Agent를 개발하는 프로젝트입니다. OpenAI 혹은 AnthropicAI compatible LLM의 Endpoint만 연결하면 바로 agent와 대화를 할 수 있습니다.

## 주요 기능

### 보안

이 프로젝트로 생성된 프로그램에서는 setting에 정해진 domain을 제외하고는 LLM이 어떠한 요청을 하더라도 연결을 차단합니다. 즉, setting에 정해진 domain에만 요청을 보낼 수 있습니다.

### Skills

PrivateClaw는 MD형식으로 정의되어있는 skill을 자유롭게 추가할 수 있습니다.

### Tool 시스템

파일 읽기/쓰기, 코드 실행 등 빌트인 도구를 기본 제공하며, 사용자 정의 도구를 추가할 수 있습니다. MCP(Model Context Protocol) 서버 연동을 통해 외부 도구와의 통합도 지원합니다.

### Sandbox 실행 환경

Agent가 코드를 실행할 때 격리된 샌드박스 환경에서 동작하여 호스트 시스템을 보호합니다. 파일 시스템 접근, 네트워크, 프로세스 등을 제한하여 안전한 실행을 보장합니다.

### 대화 기록 관리

세션 저장 및 복원 기능을 제공하여 이전 대화를 이어서 진행할 수 있습니다. 긴 대화에서도 컨텍스트를 효율적으로 관리하여 일관된 응답을 유지합니다.

### 멀티 프로바이더 지원

OpenAI, Anthropic 외에도 Ollama 등 로컬 LLM을 포함한 다양한 프로바이더를 지원합니다. OpenAI/Anthropic compatible API를 제공하는 어떤 엔드포인트든 연결 가능합니다.

### 폐쇄망(Air-gapped) 지원

외부 인터넷 연결 없이 완전히 격리된 네트워크 환경에서도 동작합니다. 모든 LLM 연결은 사용자가 지정한 내부 엔드포인트(`baseURL`)로 직접 통신하며, 외부 서비스(Vercel Gateway 등)를 경유하지 않습니다. 로컬 Ollama, 사내 vLLM 서버 등과 조합하여 완전한 오프라인 운영이 가능합니다.

### 플러그인 아키텍처

Skill 시스템을 확장하여 커뮤니티 플러그인 생태계를 지원합니다. 사용자가 직접 플러그인을 개발하고 공유할 수 있는 구조를 제공합니다.

## 기술 스택

| 구분 | 기술 | 비고 |
|------|------|------|
| 언어 | TypeScript | Node.js 런타임 |
| LLM 통합 | Vercel AI SDK (`ai`) | 프로바이더 직접 import 방식 (Gateway 미경유) |
| MCP | `@modelcontextprotocol/sdk` | Tool 확장 |
| CLI | Commander.js | CLI 인터페이스 |
| 샌드박스 | Docker SDK | 격리 실행 환경 |
| 세션 저장 | SQLite (`better-sqlite3`) | 로컬 저장소 |
| MD 파싱 | remark | 스킬 정의 파싱 |
| 스키마 | Zod | 타입 안전한 설정/도구 정의 |
| 테스트 | Vitest | 단위/통합 테스트 |
| 패키지 관리 | pnpm | 모노레포 지원 |
