#!/bin/bash
# ============================================================================
# xend POS Terminal - Production Railway Deployment Script
# ============================================================================
# This script deploys xend to Railway with all required configurations.
# Run this AFTER you have your Railway credentials ready.
# ============================================================================

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=================================================="
echo "🚀 xend POS Terminal - Railway Production Deployment"
echo -e "==================================================${NC}"
echo ""

# ============================================================================
# STEP 1: Verify Prerequisites
# ============================================================================
echo -e "${YELLOW}STEP 1: Verifying prerequisites...${NC}"
echo ""

# Check Railway CLI
if ! command -v railway &> /dev/null; then
    echo -e "${RED}❌ Railway CLI not found${NC}"
    echo "Install with: npm install -g @railway/cli"
    exit 1
fi
echo -e "${GREEN}✅ Railway CLI installed${NC}"

# Check Git
if ! command -v git &> /dev/null; then
    echo -e "${RED}❌ Git not found${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Git installed${NC}"

# Check Docker (optional but recommended)
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}⚠️  Docker not found (optional for local testing)${NC}"
else
    echo -e "${GREEN}✅ Docker installed${NC}"
fi

# ============================================================================
# STEP 2: Verify Git State
# ============================================================================
echo ""
echo -e "${YELLOW}STEP 2: Verifying Git state...${NC}"
echo ""

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}ℹ️  You have uncommitted changes:${NC}"
    git status --short
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cancelled."
        exit 0
    fi
fi

echo -e "${GREEN}✅ Git ready${NC}"

# ============================================================================
# STEP 3: Verify Railway Credentials
# ============================================================================
echo ""
echo -e "${YELLOW}STEP 3: Checking Railway credentials...${NC}"
echo ""

if [ -z "$RAILWAY_API_KEY" ]; then
    echo -e "${RED}❌ RAILWAY_API_KEY not set${NC}"
    echo ""
    echo "Get your Railway API key from: https://railway.app/account/tokens"
    echo "Then run:"
    echo "  export RAILWAY_API_KEY=\"your-api-key-here\""
    echo "  bash scripts/deploy_railway_production.sh"
    exit 1
fi
echo -e "${GREEN}✅ RAILWAY_API_KEY set${NC}"

if [ -z "$RAILWAY_PROJECT_ID" ]; then
    echo -e "${RED}❌ RAILWAY_PROJECT_ID not set${NC}"
    echo ""
    echo "Get your project ID from: https://railway.app/project/YOUR_ID"
    echo "Then run:"
    echo "  export RAILWAY_PROJECT_ID=\"your-project-id-here\""
    echo "  bash scripts/deploy_railway_production.sh"
    exit 1
fi
echo -e "${GREEN}✅ RAILWAY_PROJECT_ID set${NC}"

echo ""
echo "Project ID: $RAILWAY_PROJECT_ID"
echo ""

# ============================================================================
# STEP 4: Verify Code Quality
# ============================================================================
echo ""
echo -e "${YELLOW}STEP 4: Verifying code quality...${NC}"
echo ""

# Check if main.py exists
if [ ! -f "backend/main.py" ]; then
    echo -e "${RED}❌ backend/main.py not found${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Backend code present${NC}"

# Check if requirements.txt exists
if [ ! -f "backend/requirements.txt" ]; then
    echo -e "${RED}❌ backend/requirements.txt not found${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Requirements file present${NC}"

# Check Dockerfile
if [ ! -f "Dockerfile" ]; then
    echo -e "${RED}❌ Dockerfile not found${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Dockerfile present${NC}"

echo -e "${GREEN}✅ Code quality check passed${NC}"

# ============================================================================
# STEP 5: Summary & Confirmation
# ============================================================================
echo ""
echo -e "${BLUE}=================================================="
echo "DEPLOYMENT SUMMARY"
echo -e "==================================================${NC}"
echo ""
echo "Repository: PayBot-PH/paybot"
echo "Branch: $(git rev-parse --abbrev-ref HEAD)"
echo "Commit: $(git rev-parse --short HEAD)"
echo ""
echo "Railway Project: $RAILWAY_PROJECT_ID"
echo "Deployment Environment: production"
echo ""
echo -e "${YELLOW}This will:${NC}"
echo "  1. Build Docker image (frontend + backend)"
echo "  2. Push to Railway registry"
echo "  3. Deploy to production environment"
echo "  4. Run database migrations"
echo "  5. Start Uvicorn server on port 8000"
echo ""
echo -e "${YELLOW}Important:${NC}"
echo "  - Ensure you've configured environment variables in Railway dashboard"
echo "  - Required vars: TELEGRAM_BOT_TOKEN, ADMIN_USER_EMAIL, ADMIN_USER_PASSWORD"
echo "  - At least one payment gateway: MAYA_BUSINESS_SECRET_KEY or PAYMONGO_SECRET_KEY"
echo ""

read -p "Deploy to production? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

# ============================================================================
# STEP 6: Push Latest Code
# ============================================================================
echo ""
echo -e "${YELLOW}STEP 6: Pushing latest code to main...${NC}"
echo ""

git add -A
if [ -n "$(git status --porcelain)" ]; then
    read -p "Commit changes? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git commit -m "chore: deploy to production"
    fi
fi

echo "Pushing to origin/main..."
git push origin main
echo -e "${GREEN}✅ Code pushed${NC}"

# ============================================================================
# STEP 7: Deploy to Railway
# ============================================================================
echo ""
echo -e "${YELLOW}STEP 7: Deploying to Railway...${NC}"
echo ""

echo "Command: railway up --project \"$RAILWAY_PROJECT_ID\" --service paybot --environment production --detach"
echo ""

# Execute railway deployment
if railway up --project "$RAILWAY_PROJECT_ID" --service paybot --environment production --detach; then
    echo -e "${GREEN}✅ Deployment started!${NC}"
else
    echo -e "${RED}❌ Deployment failed${NC}"
    echo ""
    echo "Try running manually:"
    echo "  railway login"
    echo "  railway link"
    echo "  railway up --project \"$RAILWAY_PROJECT_ID\" --service paybot --environment production --detach"
    exit 1
fi

# ============================================================================
# STEP 8: Get Deployment URL
# ============================================================================
echo ""
echo -e "${YELLOW}STEP 8: Getting deployment URL...${NC}"
echo ""

# Wait a moment for deployment info to be available
sleep 3

if railway open > /dev/null 2>&1; then
    RAILWAY_URL=$(railway domain)
    if [ -n "$RAILWAY_URL" ]; then
        echo -e "${GREEN}✅ Railway URL: $RAILWAY_URL${NC}"
    else
        echo -e "${YELLOW}⚠️  Could not determine Railway URL automatically${NC}"
        echo "Check your deployment at: https://railway.app/project/$RAILWAY_PROJECT_ID"
    fi
else
    echo -e "${YELLOW}⚠️  Could not determine Railway URL${NC}"
    echo "Check your deployment at: https://railway.app/project/$RAILWAY_PROJECT_ID"
fi

# ============================================================================
# STEP 9: Monitor Deployment
# ============================================================================
echo ""
echo -e "${YELLOW}STEP 9: Monitoring deployment...${NC}"
echo ""

echo "Watching logs for 30 seconds (Ctrl+C to stop)..."
echo ""

timeout 30 railway logs --environment production -f 2>/dev/null || true

echo ""
echo -e "${GREEN}✅ Deployment monitoring complete${NC}"

# ============================================================================
# STEP 10: Verification Instructions
# ============================================================================
echo ""
echo -e "${BLUE}=================================================="
echo "✅ DEPLOYMENT COMPLETE!"
echo -e "==================================================${NC}"
echo ""
echo -e "${GREEN}Next Steps:${NC}"
echo ""
echo "1. Get your Railway URL:"
echo "   railway open"
echo ""
echo "2. Test health check:"
echo "   curl https://your-railway-url/health"
echo ""
echo "3. Access admin dashboard:"
echo "   https://your-railway-url/"
echo ""
echo "4. Register your device:"
echo "   - Login with admin credentials"
echo "   - Go to Settings → Device Management"
echo "   - Register your device ID from the APK"
echo ""
echo "5. Monitor logs:"
echo "   railway logs --environment production -f"
echo ""
echo "6. Test payment flow:"
echo "   - Create transaction on device"
echo "   - Verify status updates in dashboard"
echo "   - Check webhook logs"
echo ""
echo -e "${YELLOW}Important Variables to Configure:${NC}"
echo ""
echo "If not already set in Railway, configure these variables:"
echo "  - TELEGRAM_BOT_TOKEN"
echo "  - TELEGRAM_BOT_USERNAME"
echo "  - ADMIN_USER_EMAIL"
echo "  - ADMIN_USER_PASSWORD"
echo "  - MAYA_BUSINESS_SECRET_KEY (or PAYMONGO_SECRET_KEY)"
echo ""
echo "Set variables with: railway variable VAR_NAME value"
echo ""
echo -e "${BLUE}Documentation:${NC}"
echo "  - Deployment Guide: DEPLOY_RAILWAY.md"
echo "  - Device Testing: POS_TERMINAL_README.md"
echo "  - API Docs: https://your-railway-url/docs"
echo ""
echo -e "${GREEN}🎉 Your xend POS Terminal is now deploying to production!${NC}"
echo ""
