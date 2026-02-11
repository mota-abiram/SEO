#!/bin/bash

# UptimeRobot Setup Instructions
# This script provides step-by-step instructions for setting up UptimeRobot

echo "=================================================="
echo "🚀 UptimeRobot Setup for Render Free Tier"
echo "=================================================="
echo ""

# Check if RENDER_URL is set
if [ -z "$RENDER_URL" ]; then
    echo "⚠️  RENDER_URL environment variable not set"
    echo ""
    echo "Please set your Render service URL:"
    echo "  export RENDER_URL=https://your-app.onrender.com"
    echo ""
    read -p "Enter your Render URL (e.g., https://ga4-backend.onrender.com): " RENDER_URL
fi

echo "📋 Setup Steps:"
echo ""
echo "1. Go to https://uptimerobot.com and create a FREE account"
echo ""
echo "2. After logging in, click 'Add New Monitor'"
echo ""
echo "3. Fill in the following details:"
echo "   ┌─────────────────────────────────────────────────┐"
echo "   │ Monitor Type:       HTTP(s)                     │"
echo "   │ Friendly Name:      GA4 Backend Keep-Alive      │"
echo "   │ URL:                $RENDER_URL/health          │"
echo "   │ Monitoring Interval: 5 minutes                  │"
echo "   │ Monitor Timeout:    30 seconds                  │"
echo "   └─────────────────────────────────────────────────┘"
echo ""
echo "4. Click 'Create Monitor'"
echo ""
echo "5. (Optional) Set up email alerts:"
echo "   - Go to 'My Settings' → 'Alert Contacts'"
echo "   - Add your email address"
echo "   - Enable alerts for the monitor"
echo ""
echo "=================================================="
echo "✅ Your service will now stay alive 24/7!"
echo "=================================================="
echo ""
echo "📊 To verify it's working:"
echo "   1. Wait 20 minutes"
echo "   2. Visit: $RENDER_URL/health"
echo "   3. Should respond immediately (no cold start)"
echo ""
echo "🔍 Monitor your uptime:"
echo "   - UptimeRobot Dashboard: https://uptimerobot.com/dashboard"
echo "   - View response times and uptime percentage"
echo ""
echo "=================================================="
echo ""

# Test health endpoint
echo "🧪 Testing health endpoint..."
echo ""

if command -v curl &> /dev/null; then
    response=$(curl -s -o /dev/null -w "%{http_code}" "$RENDER_URL/health" 2>/dev/null)
    
    if [ "$response" = "200" ]; then
        echo "✅ Health endpoint is responding correctly!"
        echo ""
        curl -s "$RENDER_URL/health" | jq . 2>/dev/null || curl -s "$RENDER_URL/health"
    else
        echo "⚠️  Health endpoint returned: $response"
        echo "   Make sure your service is deployed and running"
    fi
else
    echo "ℹ️  curl not found. Skipping health check test."
    echo "   You can manually test: $RENDER_URL/health"
fi

echo ""
echo "=================================================="
echo "📚 Additional Resources:"
echo "   - Full guide: RENDER_FREE_TIER_SOLUTION.md"
echo "   - Data sync guide: DATA_SYNC_GUIDE.md"
echo "=================================================="
