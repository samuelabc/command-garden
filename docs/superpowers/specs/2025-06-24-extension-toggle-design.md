# Extension On/Off Toggle

## Summary

Add a toggle switch to the Chrome extension popup that lets the user enable or disable the extension. When disabled, the WebSocket connection to the daemon is closed and no requests are processed. The toggle state persists across browser restarts via `chrome.storage.local`.

## Decisions

- **Toggle off = full disconnect.** The daemon won't see the extension at all while disabled.
- **Service worker owns the state.** The popup is a thin view that sends messages and renders responses.
- **Persisted via `chrome.storage.local`** under key `"enabled"`. Defaults to `true` when absent.
- **Toggle replaces the reconnect button** in the existing status row. Toggling off then on serves the same reconnect purpose.

## Changes by File

### `chrome/manifest.json`

Add `"storage"` to the `permissions` array.

### `chrome/src/popup/popup-types.ts`

New `PopupMessage` variant:

```ts
| { type: 'setEnabled'; enabled: boolean }
```

New field on `PopupStatusResponse`:

```ts
enabled: boolean;
```

### `chrome/src/background/service-worker.ts`

**Startup:**

1. Read `chrome.storage.local.get("enabled")`.
2. Default to `true` if absent.
3. If enabled, call `client.connect()` (current behavior).
4. If disabled, skip connection.

**Message handler — `setEnabled`:**

1. Write new value to `chrome.storage.local.set({ enabled })`.
2. If now enabled: `client.connect()`.
3. If now disabled: `client.disconnect()`.
4. Respond with updated `PopupStatusResponse` (includes `enabled` field).

**Message handler — `getStatus`:**

Include the current `enabled` value in the response.

**Defensive guard:** If a request arrives while disabled (shouldn't happen since WS is closed), silently drop it.

### `chrome/src/popup/popup.html`

Replace the reconnect button with a CSS toggle switch in the status row. No external dependencies — pure CSS.

Layout when enabled + connected:
```
[●] Connected          [====○]
```

Layout when disabled:
```
[●] Disabled           [○====]
```

The dot color reflects state:
- **Green:** enabled + connected
- **Red:** enabled + disconnected
- **Grey:** disabled

### `chrome/src/popup/popup.ts`

- Remove reconnect button logic.
- Add toggle click handler: sends `{ type: 'setEnabled', enabled: !current }`, re-renders on response.
- `render()` updates toggle position, dot color, and status text based on `enabled` and `connected`.
- Activity list remains visible (shows past entries) but no new entries accumulate while disabled.

## Testing

- **Service worker:** Mock `chrome.storage.local`. Verify `setEnabled: false` calls `client.disconnect()` and persists. Verify `setEnabled: true` calls `client.connect()` and persists. Verify startup reads persisted state.
- **Popup:** Verify toggle renders correct state for all three combinations (enabled+connected, enabled+disconnected, disabled). Verify click sends the correct message.
- **Existing `ws-client.test.ts`:** No changes needed — connect/disconnect already tested.

## Out of Scope

- Keyboard shortcut or context menu toggle.
- Badge icon change when disabled (could be a follow-up).
- Granular per-connector enable/disable.
