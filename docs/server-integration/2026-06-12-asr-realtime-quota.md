# ASR Realtime Quota Session Limit

## Change Summary

`lobsterai-server` now caps realtime ASR sessions by the user's remaining daily ASR seconds. When quota is exhausted, realtime session creation still returns `41404 ASR daily limit exceeded`. When quota remains, the existing `maxSessionSeconds` response field is now the smaller of the configured realtime maximum and `remainingSecondsToday`.

The default per-user realtime ASR concurrency limit changed from 2 to 3. Clients should continue to treat `maxConcurrentSessions` as server-provided metadata instead of hard-coding a local limit.

The realtime WebSocket also enforces the ticket's session limit while receiving audio, so clients that continue streaming past the allowed seconds receive `41404` without waiting for the server's periodic usage flush interval.

## Endpoint Details

`POST /api/asr/realtime/sessions`

Auth: Electron JWT bearer token.

Response shape is unchanged:

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "requestId": "...",
    "wsUrl": "wss://example.com/api/asr/realtime/ws?ticket=...",
    "expiresInSeconds": 60,
    "chunkIntervalMillis": 200,
    "maxSessionSeconds": 8,
    "maxConcurrentSessions": 3,
    "usedSecondsToday": 7192,
    "remainingSecondsToday": 8,
    "limitSecondsToday": 7200
  }
}
```

`maxSessionSeconds` may now be much smaller than the configured realtime maximum when the user is near quota exhaustion.

## Frontend Action Items

No code change is required for the current Electron client. The realtime voice input hook already uses `maxSessionSeconds` to set its auto-stop timer.

## Auth Requirements

No auth changes. Session creation still requires the normal Electron JWT bearer token. The WebSocket still uses the one-time Redis ticket returned by the session creation endpoint.

## Notes & Caveats

Short ASR recognition behavior is unchanged. The short recording path still validates quota when the recorded WAV is submitted to `/api/asr/recognize`.
