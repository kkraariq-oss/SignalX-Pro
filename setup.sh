#!/bin/bash

# ==============================================
# سكريبت تثبيت تلقائي لمحلل التداول PWA
# ==============================================

set -e  # الخروج عند أي خطأ

# الألوان للطباعة
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # بدون لون

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════╗"
echo "║       📈 محلل التداول المتقدم - PWA           ║"
echo "║         سكريبت التثبيت التلقائي              ║"
echo "╚════════════════════════════════════════════════╝"
echo -e "${NC}"

# التحقق من Node.js
echo -e "${YELLOW}[1/5]${NC} التحقق من Node.js..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js غير مثبت!${NC}"
    echo ""
    echo "الرجاء تثبيت Node.js أولاً:"
    echo "  • على Ubuntu/Debian: sudo apt install nodejs npm"
    echo "  • على Termux: pkg install nodejs-lts"
    echo "  • على Mac: brew install node"
    echo "  • على Windows: قم بتحميله من https://nodejs.org/"
    exit 1
else
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}✓ Node.js مثبت: ${NODE_VERSION}${NC}"
fi

# التحقق من npm
echo -e "${YELLOW}[2/5]${NC} التحقق من npm..."
if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm غير مثبت!${NC}"
    exit 1
else
    NPM_VERSION=$(npm -v)
    echo -e "${GREEN}✓ npm مثبت: ${NPM_VERSION}${NC}"
fi

# تثبيت الاعتماديات
echo -e "${YELLOW}[3/5]${NC} تثبيت الاعتماديات..."
if [ -f "package-lock.json" ]; then
    echo "استخدام npm ci للتثبيت السريع..."
    npm ci
else
    echo "استخدام npm install..."
    npm install
fi
echo -e "${GREEN}✓ تم تثبيت الاعتماديات بنجاح${NC}"

# إنشاء الأيقونات إذا لم تكن موجودة
echo -e "${YELLOW}[4/5]${NC} التحقق من الأيقونات..."
if [ ! -f "public/pwa-512x512.png" ]; then
    echo "إنشاء الأيقونات..."
    if command -v python3 &> /dev/null; then
        python3 create_icons.py
    else
        echo -e "${YELLOW}⚠ Python3 غير متوفر - تخطي إنشاء الأيقونات${NC}"
        echo "  يمكنك إنشائها لاحقاً بتشغيل: python3 create_icons.py"
    fi
else
    echo -e "${GREEN}✓ الأيقونات موجودة${NC}"
fi

# إنشاء ملف .env إذا لم يكن موجوداً
echo -e "${YELLOW}[5/5]${NC} التحقق من ملف .env..."
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${GREEN}✓ تم إنشاء ملف .env${NC}"
        echo -e "${YELLOW}⚠ تذكير: قم بإضافة مفاتيح API في ملف .env${NC}"
    fi
else
    echo -e "${GREEN}✓ ملف .env موجود${NC}"
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║      ✅ تم التثبيت بنجاح!                     ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}الخطوات التالية:${NC}"
echo ""
echo -e "  ${YELLOW}1.${NC} لتشغيل السيرفر المحلي:"
echo -e "     ${GREEN}npm run dev${NC}"
echo ""
echo -e "  ${YELLOW}2.${NC} لتشغيل السيرفر على الشبكة (Termux):"
echo -e "     ${GREEN}npm run dev -- --host 0.0.0.0${NC}"
echo ""
echo -e "  ${YELLOW}3.${NC} لبناء المشروع للإنتاج:"
echo -e "     ${GREEN}npm run build${NC}"
echo ""
echo -e "  ${YELLOW}4.${NC} لإضافة مفاتيح API:"
echo -e "     ${GREEN}nano .env${NC} (أو أي محرر نصوص)"
echo ""
echo -e "${BLUE}روابط مفيدة:${NC}"
echo -e "  • Alpha Vantage API: ${GREEN}https://www.alphavantage.co/support/#api-key${NC}"
echo -e "  • Twelve Data API:   ${GREEN}https://twelvedata.com/${NC}"
echo ""
echo -e "${YELLOW}⚠️  تنبيه:${NC} هذا التطبيق لأغراض تعليمية فقط"
echo ""
