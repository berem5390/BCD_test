# Supabase Auth App

React + TypeScript + Supabase Auth로 구현한 서버리스 회원가입/로그인 앱입니다.

## 실행 방법

1. [Supabase](https://supabase.com/)에서 프로젝트를 만듭니다.
2. Project Settings → API에서 Project URL과 `anon` public key를 확인합니다.
3. `.env.example`을 `.env.local`로 복사하고 값을 입력합니다.
4. 아래 명령을 실행합니다.

```bash
npm install
npm run dev
```

## Supabase 설정

- Authentication → Providers → Email이 활성화되어 있어야 합니다.
- 이메일 인증을 사용할 경우 Authentication → URL Configuration의 Site URL에 배포 주소를 등록하세요.
- 로컬 개발 Redirect URL에는 `http://localhost:5173/**`를 추가하세요.
- 사용자와 비밀번호는 Supabase Auth가 관리하므로 별도의 사용자 테이블이나 서버가 필요하지 않습니다.

프론트엔드에는 반드시 `anon` public key만 사용하세요. `service_role` key는 절대 넣으면 안 됩니다.

## Gemini AI Edge Function 배포

Gemini API 키는 프론트엔드 환경변수에 넣지 않습니다. Supabase CLI 로그인 및 프로젝트 연결 후 다음 명령으로 Secret을 등록하고 함수를 배포하세요.

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase secrets set GEMINI_API_KEY=YOUR_GEMINI_API_KEY
npx supabase functions deploy ask-ai
```

`YOUR_PROJECT_REF`는 Supabase URL의 `https://`와 `.supabase.co` 사이 값입니다. Gemini API 키는 [Google AI Studio](https://aistudio.google.com/app/apikey)에서 생성합니다.

Edge Function은 로그인 사용자의 JWT를 확인하고 `gemini-3.1-flash-lite` 모델을 호출합니다. 질문만 보내거나 10MB 이하의 파일을 함께 보낼 수 있습니다.
