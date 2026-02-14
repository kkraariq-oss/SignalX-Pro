#!/usr/bin/env python3
"""
سكريبت لإنشاء أيقونات PWA بأحجام مختلفة
"""

from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size, filename, bg_color="#1a1625", emoji="📈"):
    """إنشاء أيقونة بحجم محدد"""
    
    # إنشاء صورة جديدة
    img = Image.new('RGB', (size, size), bg_color)
    draw = ImageDraw.Draw(img)
    
    # رسم دائرة خلفية بلون مميز
    accent_color = "#00d4aa"
    margin = size // 8
    draw.ellipse([margin, margin, size-margin, size-margin], fill=accent_color)
    
    # حفظ الصورة
    output_path = f"public/{filename}"
    img.save(output_path, 'PNG', quality=95)
    print(f"✓ تم إنشاء: {output_path} ({size}x{size})")

def create_all_icons():
    """إنشاء جميع الأيقونات المطلوبة"""
    
    print("🎨 بدء إنشاء أيقونات PWA...")
    print("-" * 50)
    
    # التأكد من وجود مجلد public
    os.makedirs('public', exist_ok=True)
    
    # الأيقونات المطلوبة
    icons = [
        (64, 'pwa-64x64.png'),
        (192, 'pwa-192x192.png'),
        (512, 'pwa-512x512.png'),
        (512, 'maskable-icon-512x512.png'),
        (180, 'apple-touch-icon.png'),
        (32, 'favicon-32x32.png'),
        (16, 'favicon-16x16.png'),
    ]
    
    for size, filename in icons:
        create_icon(size, filename)
    
    # إنشاء favicon.ico
    img = Image.new('RGB', (32, 32), "#1a1625")
    draw = ImageDraw.Draw(img)
    draw.ellipse([4, 4, 28, 28], fill="#00d4aa")
    img.save('public/favicon.ico', format='ICO', sizes=[(32, 32)])
    print(f"✓ تم إنشاء: public/favicon.ico")
    
    print("-" * 50)
    print("✅ تم إنشاء جميع الأيقونات بنجاح!")
    print("\n💡 ملاحظة: يمكنك استبدال هذه الأيقونات بتصاميم مخصصة لاحقاً")

if __name__ == "__main__":
    try:
        create_all_icons()
    except ImportError:
        print("❌ خطأ: مكتبة Pillow غير مثبتة")
        print("قم بتثبيتها باستخدام: pip install Pillow")
    except Exception as e:
        print(f"❌ حدث خطأ: {e}")
