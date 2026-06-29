# Telegram Login Still Failing - Complete Debug Guide

## 🎯 What We Know

- Status: ❌ Still getting "Invalid Telegram login payload"
- Bot: `@QRPHBOT`
- Railway Token Preview: `8136335018...mb_7RxkvBs`
- Configuration: Shows "ok" ✓

## 🔍 Multi-Level Diagnostics

### Level 1: Check Token Format

**Endpoint:** `GET /api/v1/auth/telegram-debug`

```bash
curl https://paybot-backoffice.up.railway.app/api/v1/auth/telegram-debug | jq .
```

This returns detailed info like:
```json
{
  "token_status": "SET",
  "token_length": 45,
  "token_chars": {
    "first_10": "8136335018",
    "last_10": "mb_7RxkvBs",
    "middle_sample": "Random"
  },
  "hints": ["✅ Token format looks correct!"]
}
```

**Check:** If you see ⚠️ warnings, that's the problem!

---

### Level 2: Capture Exact Telegram Payload

**This is the KEY step.** We need to see what Telegram is actually sending.

**Steps:**
1. Open browser: https://paybot-backoffice.up.railway.app/
2. Press **F12** → **Network** tab
3. Check "Preserve log" checkbox
4. Click "Sign In" → Select Telegram
5. Complete Telegram authorization
6. In Network tab, find POST request to: `/api/v1/auth/telegram-login-widget`
7. Click it → **Request** tab
8. Copy the JSON body dict

**Example of what to look for:**
```json
{
  "id": 987654321,
  "first_name": "John",
  "last_name": "Doe",
  "username": "johndoe",
  "photo_url": "https://t.me/i/userpic/640_xxx.jpg",
  "auth_date": 1774258800,
  "hash": "abc123def456abcdef123456abcdef1234567890"
}
```

---

### Level 3: Test the Payload Directly

**Endpoint:** `POST /api/v1/auth/telegram-login-test`

Once you have the payload from Level 2, test it:

```bash
curl -X POST https://paybot-backoffice.up.railway.app/api/v1/auth/telegram-login-test \
  -H "Content-Type: application/json" \
  -d '{
    "id": 987654321,
    "first_name": "John",
    "last_name": "Doe",
    "username": "johndoe",
    "photo_url": "https://t.me/i/userpic/640_xxx.jpg",
    "auth_date": 1774258800,
    "hash": "abc123def456abcdef123456abcdef1234567890"
  }' | jq .
```

**This will show:**

#### ✅ If Successful:
```json
{
  "success": true,
  "message": "Payload signature verified successfully!",
  "user_id": 987654321,
  "username": "johndoe",
  "auth_age_seconds": 42
}
```
→ **Problem is NOT the token!** Point to something else (caching, timing, etc)

#### ❌ If Hash Mismatch:
```json
{
  "success": false,
  "error": "Hash verification failed",
  "hint": "Token on server doesn't match Telegram's token",
  "debug": {
    "payload_hash": "abc123...",
    "computed_hash_preview": "xyz789...",
    "user_id": 987654321,
    "username": "johndoe"
  }
}
```
→ **Token on Railway doesn't match what Telegram has!**

#### ❌ If Timestamp Issue:
```json
{
  "success": false,
  "error": "Payload is too old (>24 hours)",
  "auth_date": 1234567890,
  "server_time": 1774258800,
  "age_seconds": 86000
}
```
→ **Your system clock might be off, or payload is stale**

---

## 🚨 What The Errors Mean

| Error | Cause | Solution |
|-------|-------|----------|
| `hash mismatch` | Token on Railway ≠ @BotFather token | Verify/reset token |
| `too old payload` | Timestamp > 24 hours | Check system clock |
| `timestamp in future` | Clock skew | Check system clock |
| Still fails after test | Unknown issue | Check Railway logs |

---

## 🔧 Step-by-Step Fix

### If Debug Endpoint Shows ⚠️ Token Issues:

1. **Verify token format** (should be: `ID:SECRET`)
   - Go to @BotFather → `/mybots` → Select `QRPHBOT` → "API Token"
   - Copy exact token (no spaces, no extra characters)

2. **Update Railway**
   - Dashboard → Backend Service → Variables
   - Find `TELEGRAM_BOT_TOKEN`
   - Delete old value
   - Paste new token exactly
   - Press Save → auto-redeploys

3. **Clear Everything**
   - Browser cache: Ctrl+Shift+Delete → All time
   - Close the tab completely
   - Open new tab, go to frontend
   - Try login again

### If Test Endpoint Shows Hash Mismatch:

1. **Regenerate Fresh Token**
   - @BotFather → `/mybots` → Select `QRPHBOT`
   - Click "API Token"
   - Click Regenerate (creates new token)
   - Copy and paste to Railway

2. **Hard Redeploy**
   - Railway → Backend → Restart
   - Or: `railway redeploy`

3. **Full Clear & Retry**
   - Ctrl+Shift+Delete (cache)
   - Ctrl+F5 (hard reload)
   - Try login

### If Test Endpoint Shows Success:

**Problem is not the token!** Check:
- Browser localStorage: F12 → Application → Local Storage → Look for tokens
- Session expiration/timing
- Network requests being intercepted

---

## 📋 Debugging Checklist

```
Level 1 - Token Format:
□ Ran /api/v1/auth/telegram-debug
□ No ⚠️ warnings shown
□ Token format is: ID:SECRET (with colon)
□ Token length is 36-50 chars

Level 2 - Capture Payload:
□ Opened DevTools → Network
□ Clicked Sign In → Telegram
□ Found POST /telegram-login-widget request
□ Copied full JSON request body
□ Saved it somewhere safe

Level 3 - Test Payload:
□ Ran /telegram-login-test with exact payload
□ Got response (success or specific error)
□ Identified the exact failure reason

Fix Applied:
□ If hash mismatch: Updated token on Railway
□ If token format issue: Fixed token format
□ If timestamp issue: Checked system clock
□ Cleared browser cache
□ Reloaded frontend
□ Tried login again
```

---

## 📞 Still Failing After These Steps?

1. **Share the output of:**
   - `curl https://paybot-backoffice.up.railway.app/api/v1/auth/telegram-debug | jq .`
   - `curl https://paybot-backoffice.up.railway.app/api/v1/auth/telegram-login-diagnostic | jq .`
   - Full payload from DevTools
   - Response from `/telegram-login-test` with your payload

2. **Check Railway logs:**
   ```bash
   railway logs --service backend --since 30m
   ```

3. **Contact with this info:**
   - Your @BotFather token (first 10 + last 10 chars only)
   - Railway token preview (from diagnostic endpoint)
   - Error message from `/telegram-login-test`

