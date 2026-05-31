#!/bin/bash
# PayBot Railway Deployment Helper Script
# Usage: bash scripts/deploy_to_railway_interactive.sh

set -e

echo "=================================================="
echo "🚀 PayBot Railway Deployment Assistant"
echo "=================================================="
echo ""
echo "This script will help you deploy PayBot to Railway"
echo "and configure it for device testing."
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found"
    echo ""
    echo "Install it with:"
    echo "  npm install -g @railway/cli"
    echo ""
    exit 1
fi

echo "✅ Railway CLI found"
echo ""

# Check if Git is configured
if ! git config user.name &> /dev/null; then
    echo "⚠️  Git user not configured"
    echo "Run: git config --global user.name 'Your Name'"
    exit 1
fi

echo "Step 1: Check Git status"
echo "=========================="
git status --short || true
echo ""

read -p "Continue with deployment? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "Step 2: Login to Railway"
echo "========================"
railway login
echo ""

echo "Step 3: Select or create Railway project"
echo "=========================================="
railway link
echo ""

echo "Step 4: Verify environment"
echo "============================"
railway environment
echo ""

echo "Step 5: Configure environment variables"
echo "========================================="
echo ""
echo "You need to add these critical variables:"
echo "  - TELEGRAM_BOT_TOKEN"
echo "  - TELEGRAM_BOT_USERNAME"
echo "  - ADMIN_USER_EMAIL"
echo "  - ADMIN_USER_PASSWORD"
echo "  - MAYA_BUSINESS_SECRET_KEY (or PAYMONGO_SECRET_KEY)"
echo ""

read -p "Add environment variables now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "Running: railway variable"
    echo "(Add each variable, press Ctrl+C when done)"
    railway variable || true
    echo ""
fi

echo "Step 6: Review variables"
echo "========================"
railway variable
echo ""

echo "Step 7: Deploy to production"
echo "============================"
echo ""
read -p "Deploy to production? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Deploying..."
    railway up --environment production --detach --yes
    echo ""
    echo "✅ Deployment started!"
    echo ""
    echo "Step 8: Monitor deployment"
    echo "=========================="
    echo ""
    echo "Watching logs (Ctrl+C to stop)..."
    echo ""
    railway logs --environment production -f
else
    echo "Cancelled deployment."
    exit 0
fi

echo ""
echo "=================================================="
echo "✅ Deployment Complete!"
echo "=================================================="
echo ""
echo "Next steps:"
echo "1. Get your Railway URL: railway open"
echo "2. Test health check: curl https://your-url/health"
echo "3. Access admin dashboard: https://your-url/"
echo "4. Register device in admin panel"
echo "5. Test payment flow with device"
echo ""
