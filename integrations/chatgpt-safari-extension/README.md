# Astra → ChatGPT (experimental browser bridge)

This is **not** Sign in with ChatGPT, an OpenAI API integration, or a way to read
ChatGPT history. It is an opt-in handoff into the real `https://chatgpt.com/`
website. **ChatGPT credentials must only be entered on ChatGPT's own website**.

## How the user flow works

1. Open Astra and choose **ChatGPT Bridge** in the sidebar.
2. Type a message (up to 1,200 characters), then tap **Open in ChatGPT**.
3. Your browser opens `https://chatgpt.com/?q=...` with the message prefilled.
4. **Without an extension:** review and tap **Send** yourself in ChatGPT.
5. **With this extension installed and permitted for chatgpt.com:** the extension
   attempts to click Send *once* when ChatGPT's composer exactly matches the
   prompted message. This can fail if the ChatGPT DOM changes or the native
   ChatGPT app takes over the URL.

The ChatGPT browser login/session remains outside Astra. Astra never stores
OpenAI passwords, tokens, or session cookies. Astra cannot access your ChatGPT
replies, memory, or existing conversations. The bridge currently starts a new
ChatGPT chat per handoff, not a continuation of a chosen thread.

## iPhone: package and install the optional Safari extension

The two files in this directory are a **Safari Web Extension source package**,
not an installable iOS app. Creating the iOS host app requires Xcode on a Mac:

```bash
xcrun safari-web-extension-packager \
  ./integrations/chatgpt-safari-extension \
  --ios-only --swift --app-name "Astra ChatGPT Bridge" \
  --bundle-identifier "com.example.astra.chatgptbridge" \
  --project-location ./astra-chatgpt-ios --no-open
```

Replace the example bundle identifier with one controlled by your Apple team,
then open the generated Xcode project, set signing and run on your iPhone. In
Safari > Extensions, enable the extension and grant access to `chatgpt.com`.
Use ChatGPT in Safari (not the standalone ChatGPT iOS app), because Safari
extensions cannot control another app. Test the flow while signed in.

Apple packaging guidance:
https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari

## Scope and security

- Only `https://chatgpt.com/*` is matched. No broad browsing permissions.
- It acts only when `astra_send=1`, a one-time nonce and a valid `q` prompt
  are present. It verifies the composer has the **same** text before pressing
  ChatGPT's send button. It attempts to remove the prompt from the URL after
  sending. Its session-only nonce guard helps prevent duplicate submission.
- No scraping, background polling, ChatGPT output extraction, account-cookie
  handling, or use of unofficial ChatGPT endpoints.
- The message is present in the navigation URL and **can be exposed to browser
  history**, so do not put secrets or sensitive data into this handoff.
- ChatGPT URL prefill is an observed website behavior, **not a guaranteed or
  documented OpenAI API**. ChatGPT may change it or require a second tap.
- The bridge does not bypass rate limits, login challenges or other controls.
- Anyone could construct a URL with the handoff parameters; only install the
  extension if you understand it may submit matching prefilled prompts from
  such links. Keep the extension off when not using Astra.
- For production-grade, fully integrated agent conversations and permissions,
  use supported official APIs and proper user authorization instead.

## Validation

From the repository root:

```bash
npm ci
npm run test:security
npx tsc --noEmit
npm run build
```

Safari itself must still be tested on a signed-in iPhone, because unit tests
cannot prove the live ChatGPT composer selectors are stable.
