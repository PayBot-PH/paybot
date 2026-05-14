# Railway Telegram Login - Quick Fix

## The Problem
"Invalid Telegram login payload" error when trying to login on Railway

## The Solution (99% success rate)

### 1️⃣ Get Your Bot Token
- Open Telegram: [@BotFather](https://t.me/BotFather)
- Send: `/token`
- Select your PayBot
- Copy the token (looks like: `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)

### 2️⃣ Add Token to Railway

**Via Railway Dashboard:**
```
1. Go to Railway.app → Your Project
2. Click "Backend" service (the Python service)
3. Go to "Variables" tab
4. Click "+ New Variable"
5. Name: TELEGRAM_BOT_TOKEN
6. Value: (paste your token from step 1)
7. Press Enter → Railway auto-redeploys
```

**Or via Railway CLI:**
```bash
railway variables set TELEGRAM_BOT_TOKEN="your-token-here"
```

### 3️⃣ Restart the Backend

After adding the variable, Railway will automatically deploy. Wait 2-3 minutes for:
- Building: ⏳
- Deploying: ✅
- Running: 🟢

You'll see "Running" status turn green.

### 4️⃣ Test Login

1. Open your frontend URL (Railway should provide this)
2. Click "Sign In" → "Telegram"
3. Authorize with Telegram
4. Should redirect to dashboard ✅

---

## If It Still Doesn't Work

### Check if token is actually set:
```bash
railway variables list
# Should show: TELEGRAM_BOT_TOKEN is set (not empty)
```

### Check server logs:
```bash
railway logs --service backend --follow
# Look for: "Invalid Telegram login payload"
# Search for your: telegram_user_id (your Telegram ID number)
```

### Verify token is correct:
```bash
# Token should be in format: xxxxx:ABC-DEF123
# If it has spaces, quotes, or newlines → WRONG
# Delete and re-add without any extra characters
```

### Check system clock (less common):
- Railway servers should have sync'd time
- If error says "auth_date" invalid → this issue
- Contact Railway support if persistent

---

## Checklist ✓

```
□ Downloaded bot token from @BotFather
□ Added TELEGRAM_BOT_TOKEN to Railway Variables
□ Backend finished redeploying (green status)
□ Checked Railway logs for errors
□ Tested login on frontend
□ Token copied exactly without spaces/newlines
```

---

## Next Steps

If still stuck:
1. Check this file for detailed troubleshooting: `TELEGRAM_LOGIN_TROUBLESHOOTING.md`
2. View Railway logs: `railway logs --service backend`
3. Check browser console: F12 → Console tab for frontend errors
4. Contact Railway support with logs

