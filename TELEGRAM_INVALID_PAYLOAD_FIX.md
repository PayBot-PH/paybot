# Fix: Invalid Telegram Login Payload

## 🔴 The Problem

You're getting **"Invalid Telegram login payload"** on Railway for bot **`@QRPHBOT`**

The bot token on Railway is: `8136335018...mb_7RxkvBs`

## ✅ The Solution

### Step 1: Verify the Token Matches @BotFather

**Go to @BotFather on Telegram:**
1. Send `/mybots`
2. Select your bot `QRPHBOT`
3. Click "API Token"
4. Copy the full token

**Compare with Railway token:**
- Railway has: `8136335018...mb_7RxkvBs`
- Your token from @BotFather: `8136335018:XXXXX...mb_7RxkvBs`

If they **don't match**, the token on Railway is wrong or outdated.

### Step 2: Reset Token If Needed

If tokens don't match:

1. **Go to @BotFather**
   - Send `/mybots`
   - Select `QRPHBOT`
   - Click "API Token"
   - Click "Regenerate" (to create a new token)

2. **Update Railway**
   - Go to Railway Dashboard
   - Backend Service → Variables
   - Find `TELEGRAM_BOT_TOKEN` variable
   - Replace the value with the new token from @BotFather
   - Save → Railway auto-redeploys (~2 min)

3. **Clear Browser Cache**
   - Ctrl+Shift+Delete (Windows) or Cmd+Shift+Delete (Mac)
   - Select "All time"
   - Check Cookies, Cache, Local Storage
   - Click "Clear All"

4. **Test Login**
   - Reload the frontend
   - Click "Sign In" → Select Telegram
   - Should work now! ✅

---

## 🔍 Advanced Diagnostic

If it's still not working, use the test endpoint to debug:

### Test the Signature Directly

Create a file `test_telegram.sh`:

```bash
#!/bin/bash

# Get your Telegram user ID from @userinfobot
# Get current timestamp
TIMESTAMP=$(date +%s)

# Create test payload (replace with your actual data)
curl -X POST https://paybot-backoffice.up.railway.app/api/v1/auth/telegram-login-test \
  -H "Content-Type: application/json" \
  -d '{
    "id": 123456789,
    "first_name": "Your",
    "last_name": "Name",
    "username": "yourusername",
    "auth_date": '$(date +%s)',
    "hash": "abc123def456"
  }' | jq .
```

You'll get one of these responses:

#### ✅ Success
```json
{
  "success": true,
  "message": "Payload signature verified successfully!",
  "user_id": 123456789,
  "username": "yourusername",
  "auth_age_seconds": 5
}
```

#### ❌ Hash Mismatch
```json
{
  "success": false,
  "error": "Hash verification failed",
  "hint": "Token on server doesn't match Telegram's token. Clear browser cache and try again.",
  "debug": {
    "payload_hash": "abc123...",
    "computed_hash_preview": "xyz789...",
    "user_id": 123456789,
    "username": "yourusername"
  }
}
```

**Meaning:** The bot token on Railway doesn't match what Telegram has. Go back to Step 2.

---

## 📋 Troubleshooting Checklist

```
□ Found bot token on @BotFather: _______________
□ Compared with Railway: 8136335018...mb_7RxkvBs
□ Tokens match? YES / NO
□ If NO: Regenerated new token on @BotFather
□ If NO: Updated TELEGRAM_BOT_TOKEN on Railway
□ Backend redeployed (green status)
□ Cleared browser cache (Ctrl+Shift+Delete)
□ Reloaded frontend
□ Tested login again
```

---

## 🚨 Still Not Working?

### Check Railway Logs

```bash
railway logs --service backend --since 30m --follow
```

Look for these messages:

**If you see:** `hash mismatch`
→ Token doesn't match. Go back to Step 2.

**If you see:** `auth_date out of range`
→ Your device time is wrong. Check system clock.

**If you see:** `bot_token is empty`
→ Token somehow isn't loading. Redeploy the backend.

### Quick Redeploy

```bash
railway redeploy
```

---

## 🔗 Related Resources

- **Diagnostic endpoint:** `GET /api/v1/auth/telegram-login-diagnostic`
- **Test endpoint:** `POST /api/v1/auth/telegram-login-test`
- **Frontend logs:** F12 → Network tab → Look for POST `/telegram-login-widget`

---

## 📞 Support

If still stuck after all these steps:
1. Save Railway logs: `railway logs > logs.txt`
2. Share the authentication section from logs
3. Confirm @BotFather token matches the preview shown

