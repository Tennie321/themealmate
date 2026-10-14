# Remote Browser Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a persistent remote browser and official-API streaming workflow to Astra.
**Architecture:** Docker/Playwright WS service behind a same-origin proxy, plus React remote viewer.
**Tech Stack:** Playwright Chromium, Node 22+, ws, Docker, React, OpenAI Responses SSE.
**Spec:** docs/superpowers/specs/2026-10-13-remote-browser-control.md

## Global Constraints
- No automated scraping of ChatGPT website output or CAPTCHA bypass.
- No API keys or cookies in frontend code, query strings or logs.
- Preserve existing Astra/Lovable app and ChatGPT link handoff.
- Work on isolated branch; no merge until verified.

## Review Focus
- Reject bad origin, invalid session signatures, expired cookies.
- Reject malformed websocket commands and oversized text; don't expose arbitrary CDP.
- One active Chromium profile; persist login data in volume.
- Propagate upstream SSE error and abortion.
- Ensure UI displays separate billing/conversation semantics.

### Task 1: Auth and protocol
- [ ] Add server auth+validation modules and failing regression tests.
- [ ] Run Node tests (red), implement, run (green), commit.
### Task 2: Browser worker and Docker
- [ ] Add persistent Chromium, CDP screencast, mouse/key/text input and cleanup.
- [ ] Add Dockerfile and Compose, validate browser on deployed host.
### Task 3: Streaming prompts
- [ ] Add Node Responses API SSE parser with incremental deltas and abort; test.
### Task 4: UI
- [ ] Build interactive remote browser panel and connect it to ChatGPT Bridge.
- [ ] Verify visual interaction and desktop/mobile layout.
### Task 5: Operations
- [ ] Document reverse proxy, secrets, privacy and smoke tests.
- [ ] Run service tests, app build/typecheck/security tests, create draft PR.
