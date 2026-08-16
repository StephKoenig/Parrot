# Parrot — TODO

Forward-looking roadmap. See [`Completed.md`](Completed.md) for everything already shipped.

---

## Future Enhancements

### User-Configurable Sites (advanced)
- [ ] Universal content script with dynamic registration (`browser.scripting.registerContentScripts`)
- [ ] Per-site permission request (`browser.permissions.request`)

### Polish & Reliability (remaining)

**Error Handling**
- [ ] Retry logic for transient network failures during index build (self-heal covers moved-server; a plain transient retry is still open)

**Performance**
- [ ] Measure index build time for large libraries (1000+ items)

**Episode gap checking**
- [ ] Configurable aired-episode grace period — replace the implicit "aired today or later doesn't count as missing" boundary (`excludeFuture` in `season-gaps.ts`) with a user-set "don't count episodes aired in the last N days" option. Today the only knobs are the excludeFuture on/off toggle plus 24h caches (`eg:*`, Sonarr fresh TTL).
- [ ] Options label "Exclude future/unreleased movies" is misleading — it also governs TV episodes (`excludeFuture` gates both `collection.ts` and `season-gaps.ts`). Reword.

### Code Hygiene

- [ ] Adopt `noUncheckedIndexedAccess` — wxt 0.21's generated tsconfig enables it; we override it to `false` in the root `tsconfig.json` because turning it on surfaces ~200 `T | undefined` errors across src + tests. Worth adopting incrementally: it catches exactly the "index into a map/array and trust the result" bug class.
- [ ] Add unit tests for `gap-checker.ts` (needs browser.runtime mocking)
- [ ] Add unit tests for `url-observer.ts` (needs MutationObserver mocking)

**Dependency majors (deferred 2026-08-01 — clears all 11 open `npm audit` advisories)**
- [x] `eslint` 9 → 10 (+ `@eslint/js` 10) — done 2026-08-16, including the `typescript-eslint` meta-package swap in `eslint.config.js`.
- [x] `wxt` 0.20 → 0.21 — done 2026-08-16; `vite` added to `devDependencies`, `npm audit` now reports 0 vulnerabilities. Note: 0.21's generated tsconfig enables `noUncheckedIndexedAccess`, overridden to `false` in root `tsconfig.json` (adoption tracked under Code Hygiene).
- [ ] `typescript` 5.9 → 7 — **blocked**: typescript-eslint 8.65 peers on `typescript >=4.8.4 <6.1.0`. Revisit when typescript-eslint ships TS 7 support.
- [ ] Keep `package-lock.json`'s `version` field in sync — the bump scripts write `package.json` only, so it had drifted to 1.24.0. Simplest fix: `npm install --package-lock-only` after a bump rather than teaching the scripts to patch the lockfile.

---

## Additional Sites

- [ ] TV Time (`tvtime.com/show/*`)
- [ ] Simkl (`simkl.com/movies/*`, `simkl.com/tv/*`)

---

## Advanced Settings

- [ ] Configurable badge position (before/after title)
- [ ] Toggle per-site enablement
- [ ] Show/hide "not owned" badge (default: hidden)
- [ ] Dark/light badge theme override

**Integration with ComPlexionist**
- [ ] Shared ignore lists (if user ignores a show in desktop app, respect in extension)
- [ ] Link to ComPlexionist from extension popup

---

## Publishing

**Chrome Web Store**
- [ ] Store listing assets (screenshots, icon, description)
- [ ] Privacy policy (extension accesses local Plex server only)
- [ ] Submit for review

**Firefox Add-ons**
- [ ] Firefox-specific testing
- [ ] Submit to AMO

**CI/CD**
- [ ] GitHub Actions workflow for extension builds
- [ ] Auto-zip on tag push
- [ ] Automated version bumping in CI

---

## Plex API Modernisation

Plex officially published OpenAPI docs (Sep 2025) and introduced a new auth flow:

- [ ] **New auth flow** — device key registration → JWT → `X-Plex-Token` exchange with 7-day refresh. Current direct-token approach still works but doesn't handle token expiry gracefully.
- [ ] **Pagination for large libraries** — `X-Plex-Container-Start` / `X-Plex-Container-Size` headers. Current index builder fetches everything in one shot which may timeout on very large libraries (10k+ items).
- [ ] **Review official API docs** ([developer.plex.tv](https://developer.plex.tv)) for any new endpoints or fields we could leverage (e.g. better resolution/codec metadata).

Reference: [Plex Pro Week '25 blog post](https://www.plex.tv/blog/plex-pro-week-25-api-unlocked/)

---

## Ideas

- Episode-level matching on episode-specific pages (e.g. TMDB `/tv/{id}/season/{n}/episode/{n}`)
- Tiered cache TTL (ended shows = longer cache, continuing shows = shorter)
- Cross-reference with ComPlexionist collection gap data
