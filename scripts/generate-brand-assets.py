import subprocess
from pathlib import Path
from PIL import Image

root = Path.cwd()
mobile = root / 'apps/mobile'
assets = mobile / 'assets/images'
logos = assets / 'logos'
ios_icons = assets / 'app-icons/ios'
android_icons = assets / 'app-icons/android'

note_path = (
    'M704.0,194.6C659.5,216.0,639.9,222.2,576.5,234.5C544.1,240.8,536.8,242.6,522.8,247.7'
    'C486.4,260.9,464.4,288.7,466.3,319.3C466.5,323.9,470.8,347.0,475.9,371.5'
    'C490.5,441.4,494.4,460.5,508.0,527.0C518.3,577.5,519.4,583.0,518.9,583.5'
    'C518.7,583.6,514.7,583.0,510.1,582.0C430.5,564.6,352.8,610.0,334.5,684.5'
    'C320.8,740.0,348.5,797.5,401.5,823.8C436.5,841.1,478.4,843.5,516.4,830.3'
    'C576.2,809.5,614.0,759.2,614.0,700.3C614.0,680.9,613.4,677.2,594.0,583.0'
    'C590.1,564.0,586.1,544.2,585.0,539.0C583.9,533.8,580.3,516.2,577.0,500.0'
    'C573.7,483.8,570.1,466.2,569.0,461.0C568.0,455.8,564.4,438.2,561.0,422.0'
    'C548.9,363.4,549.2,366.5,554.8,361.0C559.1,356.6,568.5,353.4,601.5,345.0'
    'C622.5,339.7,632.0,336.8,643.5,332.5C698.2,311.8,728.8,269.1,729.0,213.0'
    'C729.0,200.9,727.6,197.0,722.1,193.3C717.3,190.0,712.7,190.4,704.0,194.6Z'
)

def render_svg_to_png(svg_str: str, out_path: Path, mode='RGBA'):
    temp_svg = root / '.cache/temp_render.svg'
    temp_png = root / '.cache/temp_render.png'
    temp_svg.write_text(svg_str)
    subprocess.run(['resvg', '-w', '1024', '-h', '1024', str(temp_svg), str(temp_png)], check=True)
    img = Image.open(temp_png)
    if mode == 'RGB':
        img = img.convert('RGB')
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path)
    print(f'Rendered: {out_path.relative_to(root)} ({mode})')

# 1. In-app settings logo PNGs (squircle rx=224, RGBA)
render_svg_to_png(logos.joinpath('logo-crimson-note.svg').read_text(), logos / 'logo-crimson-note.png', 'RGBA')
render_svg_to_png(logos.joinpath('logo-white-note.svg').read_text(), logos / 'logo-white-note.png', 'RGBA')
render_svg_to_png(logos.joinpath('logo-dark-note.svg').read_text(), logos / 'logo-dark-note.png', 'RGBA')
render_svg_to_png(logos.joinpath('logo-dark-crimson.svg').read_text(), logos / 'logo-dark-crimson.png', 'RGBA')

# 2. Splash icon (squircle RGBA)
render_svg_to_png(logos.joinpath('logo-crimson-note.svg').read_text(), assets / 'splash-icon.png', 'RGBA')

# 3. Square Full-bleed iOS & Legacy Android icons (RGB)
svg_crimson_square = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F96165" />
      <stop offset="50%" stop-color="#F4285E" />
      <stop offset="100%" stop-color="#E50960" />
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)" />
  <path d="{note_path}" fill="#FFFFFF" fill-rule="evenodd" />
</svg>'''
render_svg_to_png(svg_crimson_square, ios_icons / 'crimson-note.png', 'RGB')
render_svg_to_png(svg_crimson_square, assets / 'icon.png', 'RGB')
render_svg_to_png(svg_crimson_square, android_icons / 'crimson-note-legacy.png', 'RGB')

svg_white_square = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#f2f2f7" />
    </linearGradient>
    <linearGradient id="note" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F96165" />
      <stop offset="50%" stop-color="#F4285E" />
      <stop offset="100%" stop-color="#E50960" />
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)" />
  <path d="{note_path}" fill="url(#note)" fill-rule="evenodd" />
</svg>'''
render_svg_to_png(svg_white_square, ios_icons / 'white-note.png', 'RGB')
render_svg_to_png(svg_white_square, android_icons / 'white-note-legacy.png', 'RGB')

svg_dark_note_square = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1c1c22" />
      <stop offset="60%" stop-color="#0e0e12" />
      <stop offset="100%" stop-color="#08080a" />
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)" />
  <path d="{note_path}" fill="#ffffff" fill-rule="evenodd" />
</svg>'''
render_svg_to_png(svg_dark_note_square, ios_icons / 'dark-note.png', 'RGB')
render_svg_to_png(svg_dark_note_square, android_icons / 'dark-note-legacy.png', 'RGB')

svg_dark_crimson_square = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1d161a" />
      <stop offset="60%" stop-color="#0e0a0d" />
      <stop offset="100%" stop-color="#080608" />
    </linearGradient>
    <linearGradient id="note" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F96165" />
      <stop offset="50%" stop-color="#F4285E" />
      <stop offset="100%" stop-color="#E50960" />
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)" />
  <path d="{note_path}" fill="url(#note)" fill-rule="evenodd" />
</svg>'''
render_svg_to_png(svg_dark_crimson_square, ios_icons / 'dark-crimson.png', 'RGB')
render_svg_to_png(svg_dark_crimson_square, android_icons / 'dark-crimson-legacy.png', 'RGB')

# 4. Android Adaptive icons: Foreground and Monochrome (RGBA)
# White note on transparent
svg_white_isolated = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <path d="{note_path}" fill="#FFFFFF" fill-rule="evenodd" />
</svg>'''
render_svg_to_png(svg_white_isolated, android_icons / 'crimson-note-foreground.png', 'RGBA')
render_svg_to_png(svg_white_isolated, android_icons / 'crimson-note-monochrome.png', 'RGBA')
render_svg_to_png(svg_white_isolated, android_icons / 'dark-note-foreground.png', 'RGBA')
render_svg_to_png(svg_white_isolated, android_icons / 'dark-note-monochrome.png', 'RGBA')
render_svg_to_png(svg_white_isolated, assets / 'android-icon-foreground.png', 'RGBA')
render_svg_to_png(svg_white_isolated, assets / 'android-icon-monochrome.png', 'RGBA')

# Crimson gradient note on transparent
svg_crimson_isolated = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="note" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F96165" />
      <stop offset="50%" stop-color="#F4285E" />
      <stop offset="100%" stop-color="#E50960" />
    </linearGradient>
  </defs>
  <path d="{note_path}" fill="url(#note)" fill-rule="evenodd" />
</svg>'''
render_svg_to_png(svg_crimson_isolated, android_icons / 'white-note-foreground.png', 'RGBA')
render_svg_to_png(svg_crimson_isolated, android_icons / 'white-note-monochrome.png', 'RGBA')
render_svg_to_png(svg_crimson_isolated, android_icons / 'dark-crimson-foreground.png', 'RGBA')
render_svg_to_png(svg_crimson_isolated, android_icons / 'dark-crimson-monochrome.png', 'RGBA')

# 5. Sync to iOS native Images.xcassets
xcassets = mobile / 'ios/app/Images.xcassets'
import shutil
shutil.copy(ios_icons / 'crimson-note.png', xcassets / 'AppIcon.appiconset/App-Icon-1024x1024@1x.png')
shutil.copy(ios_icons / 'crimson-note.png', xcassets / 'AppIconCrimsonNote.appiconset/AppIconCrimsonNote-1024.png')
shutil.copy(ios_icons / 'white-note.png', xcassets / 'AppIconWhiteNote.appiconset/AppIconWhiteNote-1024.png')
shutil.copy(ios_icons / 'dark-note.png', xcassets / 'AppIconDarkNote.appiconset/AppIconDarkNote-1024.png')
shutil.copy(ios_icons / 'dark-crimson.png', xcassets / 'AppIconDarkCrimson.appiconset/AppIconDarkCrimson-1024.png')

splash_src = Image.open(assets / 'splash-icon.png')
splash_dir = xcassets / 'SplashScreenLogo.imageset'
splash_src.resize((120, 120), Image.Resampling.LANCZOS).save(splash_dir / 'image.png')
splash_src.resize((240, 240), Image.Resampling.LANCZOS).save(splash_dir / 'image@2x.png')
splash_src.resize((360, 360), Image.Resampling.LANCZOS).save(splash_dir / 'image@3x.png')
print('Synchronized native iOS Images.xcassets (AppIcons & SplashScreenLogo)')

print('All brand assets successfully updated!')
