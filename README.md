# React + TypeScript + Vite

## 활동일지 2단계 흐름

- 예약 시에는 예정 활동인원만 필수로 저장하고 `Pending` 상태로 시작합니다.
- 활동 종료 후 다음 로그인 시 미작성 활동일지가 팝업으로 표시됩니다.
- `Members` 시트에서 로그인한 동아리의 `Active` 회원만 참여자로 선택할 수 있습니다.
- 선택한 회원의 학교급과 성별로 인원 현황을 자동 계산합니다.
- 동아리 계정은 관리자와 데일리 계정을 제외하고 최대 40개를 기준으로 사용합니다.

### Google Apps Script 배포

`GAS_FINAL_DEPLOY.js`를 Apps Script 프로젝트에 반영한 뒤 새 버전으로 웹 앱을 배포해야 새 API가 작동합니다.

### 4자리 PIN 초기 설정

1. Apps Script를 새 버전으로 배포합니다.
2. Apps Script 편집기에서 `generateInitialPinsFromEditor`를 한 번 실행합니다.
3. 실행 로그에 출력된 계정별 임시 PIN을 안전하게 전달합니다.
4. 첫 로그인에서 각 계정이 새 PIN으로 반드시 변경합니다.

PIN 원문은 시트와 GitHub에 저장하지 않으며, PIN이 없는 계정만 초기 발급 대상입니다. 로그인은 5회 실패 시 15분 잠금되고 세션은 2시간 동안 유지됩니다.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
