# Telegram Login Troubleshooting Guide

## Issue: "Invalid Telegram login payload" on Railway

This error occurs when the backend's Telegram signature verification fails during login.

---

## Root Cause Analysis

The verification fails at `/api/v1/auth/telegram-login-widget` due to one of these reasons:

### 1. **Missing or Incorrect `TELEGRAM_BOT_TOKEN`** (Most Common)
- The backend environment variable `TELEGRAM_BOT_TOKEN` is not set on Railway
- The token value is empty or malformed
- The token doesn't match the Telegram bot being used

**Location in code:** `backend/routers/auth.py:121-122`
```python
if not bot_token:
    return False  # Signature verification fails
```

### 2. **System Clock Skew**
- Server time is out of sync with client/Telegram
- Payload `auth_date` is too old or in the future
- Default tolerance: 24 hours

**Location in code:** `backend/routers/auth.py:125`
```python
if payload.auth_date > now or (now - payload.auth_date) > max_age_seconds:
    return False  # Auth timestamp invalid
```

### 3. **HMAC Signature Mismatch**
- Token has changed since user signed the payload
- Payload was tampered with
- Hash computation mismatch

**Location in code:** `backend/routers/auth.py:138-140`
```python
secret_key = hashlib.sha256(bot_token.encode("utf-8")).digest()
computed_hash = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()
return hmac.compare_digest(computed_hash, payload.hash)
```

---

## Diagnostic Steps

### Step 1: Check Environment Variables on Railway

Go to your **Railway Dashboard → Project → Backend Service → Variables**

Verify these are set:
```
TELEGRAM_BOT_TOKEN=<your-bot-token>
TELEGRAM_ADMIN_IDS=<your-telegram-user-id>  (may be empty initially)
TELEGRAM_BOT_USERNAME=<your-bot-username>
JWT_SECRET_KEY=<long-random-string>       (should be set!)
```

**Action:** If `TELEGRAM_BOT_TOKEN` is missing → **Add it now**

### Step 2: Verify the Bot Token Format

Your bot token should look like:
```
1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi
```

**Action:**
1. Get token from [@BotFather](https://t.me/BotFather) on Telegram
2. Go to Railway > Backend Service > Variables
3. Create/update `TELEGRAM_BOT_TOKEN` with the exact token

### Step 3: Check Railway Server Time

Run this on Railway backend logs to verify server time:

```bash
# Check if Railway service has correct time
curl https://your-railway-backend-url/health
# Should return current timestamp
```

**Action:** If time is significantly off (>1 minute), contact Railway support

### Step 4: Enable Debug Logging

Temporarily add this to `backend/routers/auth.py` to log verification details:

```python
@router.post("/telegram-login-widget", response_model=TokenExchangeResponse)
async def telegram_login_widget(payload: TelegramWidgetLoginRequest, db: AsyncSession = Depends(get_db)):
    bot_token = str(getattr(settings, "telegram_bot_token", "") or "")

    # DEBUG LOGGING
    logger.info(f"[DEBUG] bot_token={'SET' if bot_token else 'MISSING'}")
    logger.info(f"[DEBUG] payload.id={payload.id}")
    logger.info(f"[DEBUG] payload.auth_date={payload.auth_date}")
    logger.info(f"[DEBUG] payload.hash={payload.hash}")
    logger.info(f"[DEBUG] current_time={int(time.time())}")

    # ... rest of function
```

Then check **Railway Logs** for these debug messages

---

## Solution Steps

### ✅ Quick Fix (Most Likely to Work)

1. **Go to Railway Dashboard**
   - Project → Backend Service → Variables

2. **Add/Update `TELEGRAM_BOT_TOKEN`**
   - Click "New Variable"
   - Name: `TELEGRAM_BOT_TOKEN`
   - Value: (paste your bot token from @BotFather)
   - Click Save → Railway auto-redeploys

3. **Restart Backend Service**
   - Click "Redeploy" button
   - Wait for deployment to complete (~2 min)

4. **Test Login**
   - Go to https://your-railway-backend-url/
   - Click login with Telegram
   - Should work now!

### 🔍 Advanced Diagnostics

If it still fails after adding the token:

**Check Railway logs:**
```bash
railway logs --service backend --follow
```

**Look for these patterns:**
- `bot_token is not configured` → Token not set
- `Invalid Telegram login payload` → Hash mismatch
- `auth_date` → Clock skew issue
- `HTTPException 403` → User not in admin list

**Check frontend logs (Browser DevTools):**
```javascript
// Console → Network tab
// Look for POST /api/v1/auth/telegram-login-widget
// Check Response tab for the error detail
```

---

## Configuration Checklist

On Railway → Backend Service → Variables:

```
✅ DATABASE_URL              (provided by Railway)
✅ JWT_SECRET_KEY            (random 64-char string)
✅ TELEGRAM_BOT_TOKEN        ← MOST CRITICAL
✅ TELEGRAM_BOT_USERNAME     (e.g., my_paybot_bot)
✅ TELEGRAM_ADMIN_IDS        (your Telegram user ID)
✅ XENDIT_SECRET_KEY         (if payments enabled)
✅ PAYMONGO_SECRET_KEY       (if payments enabled)
```

---

## Testing Locally

Before deploying to Railway, test Telegram auth locally:

```bash
# Terminal 1: Start backend
cd backend
python -m uvicorn main:app --reload

# Terminal 2: Check config
python -c "from core.config import settings; print(f'Token: {settings.telegram_bot_token}')"
```

Visit: http://localhost:8000/api/v1/auth/telegram-login-config

Should return:
```json
{"bot_username": "your_bot_name"}
```

---

## Still Not Working?

1. **Clear browser cache**
   - Ctrl+Shift+Delete (Windows) or Cmd+Shift+Delete (Mac)
   - Clear "All time"

2. **Try incognito/private mode**
   - Avoids cached Telegram widget

3. **Verify bot is public**
   - @BotFather → /mybots → Select bot → Settings → Connect to Telegram
   - Should say "Bot API: enabled"

4. **Check bot token hasn't been reset**
   - @BotFather → /mybots → Select bot → API Token
   - Make sure it matches Railway `TELEGRAM_BOT_TOKEN`

5. **Contact support**
   - Make note of:
     - When error started occurring
     - Which browser/device
     - Full error message from Network tab
     - Railway logs excerpt

---

## Files to Reference

- **Verification logic:** `backend/routers/auth.py:120-140`
- **Config:** `backend/core/config.py:75-76, 110-113`
- **Frontend widget:** `frontend/src/lib/auth.ts:56-76`
- **Login page:** `frontend/src/pages/Login.tsx:186-214`

