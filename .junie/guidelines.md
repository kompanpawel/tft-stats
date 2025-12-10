### TFTStats — Project‑specific Development Guidelines

#### Build and Configuration

- Stack
  - Angular 20 (standalone APIs), RxJS 7.8, TypeScript ~5.8, Karma/Jasmine for unit tests.
  - Tailwind CSS v4 via `@tailwind` directives in `src/styles.css`.
  - Root component `App` renders `LeaderboardComponent` (standalone). Data comes from `RiotApiService` (`src/riot-api.ts`).

- Install and run
  - Install: `npm ci` (preferred) or `npm install` on first setup.
  - Dev server: `npm start` (Angular CLI `ng serve`).
  - Production build: `npm run build`.

- Environments and API keys
  - Riot API key is read from files in `src/environments/` and used by `RiotApiService` which currently imports `./environments/environment.development` directly.
  - For local runs with live API calls, ensure a valid `apiKey` is present. Do NOT commit real keys.
  - If the key is missing/empty, `getPlayerRanks()` yields entries with `error: true, message: 'API Key is missing.'`; the UI shows a warning, allowing the app to render without a key.

- Tailwind and styles
  - `src/styles.css` includes a Google Font. Angular’s CSS linter warns if `@import` isn’t first. Keep any `@import` statements before other at‑rules to avoid warnings:
    - Recommended order at the very top of `styles.css`:
      1) `@import url('https://fonts.googleapis.com/...');`
      2) `@import "tailwindcss";`
      3) `@tailwind base;`, `@tailwind components;`, `@tailwind utilities;`

#### Testing

- Commands
  - Watch mode: `npm test` (alias for `ng test`).
  - Headless single run (CI): `npm run test -- --watch=false --browsers=ChromeHeadless`.
  - Run only specific specs: `npm run test -- --watch=false --browsers=ChromeHeadless --include=src/leaderboard/leaderboard.spec.ts`.
    - `--include` supports multiple paths/patterns (comma‑separated).
  - Temporarily focus/skip with Jasmine: `fdescribe`/`fit` or `xdescribe`/`xit` — remember to revert.

- Spec discovery
  - `tsconfig.spec.json` includes `src/**/*.ts`; Angular CLI picks up `*.spec.ts` anywhere under `src`.

- DI and HttpClient
  - `RiotApiService` depends on `HttpClient`. Tests that inject it must import `HttpClientTestingModule` to satisfy DI and to mock HTTP:
    ```ts
    import { TestBed } from '@angular/core/testing';
    import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
    import { RiotApiService } from '../riot-api';

    describe('RiotApiService', () => {
      let service: RiotApiService;
      let http: HttpTestingController;

      beforeEach(() => {
        TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
        service = TestBed.inject(RiotApiService);
        http = TestBed.inject(HttpTestingController);
      });

      afterEach(() => http.verify());
    });
    ```

- Component tests (mocking services)
  - `LeaderboardComponent` depends on `RiotApiService`. Prefer mocking the service so tests don’t hit the network:
    ```ts
    import { of } from 'rxjs';
    import { TestBed } from '@angular/core/testing';
    import { LeaderboardComponent } from './leaderboard';
    import { RiotApiService } from '../riot-api';

    await TestBed.configureTestingModule({
      imports: [LeaderboardComponent],
      providers: [{ provide: RiotApiService, useValue: { getPlayerRanks: () => of([]) } }]
    }).compileComponents();
    ```

- Async/observable testing
  - Use `firstValueFrom` with `async/await` or subscribe and assert in the `next` handler for single‑shot streams.
  - For time‑based RxJS (`timer`, `interval`) inside services, prefer mocking the service in component tests to avoid timing flakiness.

- Example: create and run a simple test (verified)
  - Example content:
    ```ts
    // src/example.smoke.spec.ts
    describe('Smoke test', () => {
      it('runs', () => {
        expect(true).toBeTrue();
      });
    });
    ```
  - Run it only: `npm run test -- --watch=false --browsers=ChromeHeadless --include=src/example.smoke.spec.ts`.
  - Remove temporary smoke specs after verification to keep the suite clean.

#### Code Style and Conventions

- TypeScript/Angular
  - Use standalone components/services; avoid NgModules for new code.
  - Keep network logic in services; components should orchestrate and render.
  - Use RxJS pipeable operators; unsubscribe in `OnDestroy` for manual subscriptions (current `LeaderboardComponent` pattern). Prefer `async` pipe where practical.

- Formatting
  - HTML is formatted by Prettier with the Angular parser (see `package.json` `prettier.overrides`). Follow existing import ordering and code layout.

- Error handling
  - External calls should guard errors and surface friendly flags/messages to the UI (current `RiotApiService` uses `catchError` and missing‑key guards).

#### Quick Reference

- Install: `npm ci`
- Serve: `npm start` → http://localhost:4200
- Build: `npm run build`
- Test (watch): `npm test`
- Test (CI): `npm run test -- --watch=false --browsers=ChromeHeadless`
- Test one spec: `npm run test -- --watch=false --browsers=ChromeHeadless --include=src/path/to/file.spec.ts`
