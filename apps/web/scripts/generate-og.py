#!/usr/bin/env python3
"""
Regenerate public/og-image.png, public/og-image-en.png, and public/apple-touch-icon.png
from brand tokens and typography.

Run via:
  python3 scripts/generate-og.py
"""

import base64
import os
import subprocess
import sys

script_dir = os.path.dirname(os.path.abspath(__file__))
web_dir = os.path.dirname(script_dir)
public_dir = os.path.join(web_dir, "public")

font_dir = "/mnt/Jad/github/projects/waqftech/waqftech.org/legacy/cf-fonts/s/tajawal/5.2.7"

def get_b64(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

logo_path = os.path.join(public_dir, "waqftech-logo.svg")
with open(logo_path, "rb") as f:
    logo_svg = f.read()

logo_b64 = base64.b64encode(logo_svg).decode("utf-8")
logo_data_uri = f"data:image/svg+xml;base64,{logo_b64}"

tajawal_ar_800 = get_b64(f"{font_dir}/arabic/800/normal.woff2")
tajawal_ar_700 = get_b64(f"{font_dir}/arabic/700/normal.woff2")
tajawal_ar_400 = get_b64(f"{font_dir}/arabic/400/normal.woff2")
tajawal_lat_800 = get_b64(f"{font_dir}/latin/800/normal.woff2")
tajawal_lat_700 = get_b64(f"{font_dir}/latin/700/normal.woff2")
tajawal_lat_400 = get_b64(f"{font_dir}/latin/400/normal.woff2")

common_styles = f"""
@font-face {{
  font-family: 'Tajawal';
  font-weight: 800;
  src: url('data:font/woff2;base64,{tajawal_ar_800}') format('woff2');
  unicode-range: U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF;
}}
@font-face {{
  font-family: 'Tajawal';
  font-weight: 800;
  src: url('data:font/woff2;base64,{tajawal_lat_800}') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC;
}}
@font-face {{
  font-family: 'Tajawal';
  font-weight: 700;
  src: url('data:font/woff2;base64,{tajawal_ar_700}') format('woff2');
  unicode-range: U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF;
}}
@font-face {{
  font-family: 'Tajawal';
  font-weight: 700;
  src: url('data:font/woff2;base64,{tajawal_lat_700}') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC;
}}
@font-face {{
  font-family: 'Tajawal';
  font-weight: 400;
  src: url('data:font/woff2;base64,{tajawal_ar_400}') format('woff2');
  unicode-range: U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF;
}}
@font-face {{
  font-family: 'Tajawal';
  font-weight: 400;
  src: url('data:font/woff2;base64,{tajawal_lat_400}') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC;
}}

* {{
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}}

body {{
  width: 1200px;
  height: 630px;
  background-color: #0b1d26;
  background-image: 
    radial-gradient(circle at 90% 12%, rgba(46, 125, 118, 0.45) 0%, transparent 45%),
    radial-gradient(circle at 10% 90%, rgba(198, 238, 103, 0.15) 0%, transparent 50%),
    radial-gradient(circle at 50% 50%, rgba(17, 43, 56, 1) 0%, #09171f 100%);
  color: #eef5f2;
  font-family: 'Tajawal', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  overflow: hidden;
  padding: 38px 46px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
}}

.bg-grid {{
  position: absolute;
  inset: 0;
  background-size: 40px 40px;
  background-image: 
    linear-gradient(to right, rgba(219, 233, 228, 0.035) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(219, 233, 228, 0.035) 1px, transparent 1px);
  pointer-events: none;
}}

.border-frame {{
  position: absolute;
  inset: 18px;
  border: 1px solid rgba(46, 125, 118, 0.35);
  border-radius: 20px;
  pointer-events: none;
}}

.mono {{
  font-family: 'JetBrains Mono NL', 'JetBrains Mono', monospace;
  direction: ltr !important;
  unicode-bidi: isolate;
  white-space: nowrap;
}}

.header {{
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 2;
}}

.brand {{
  display: flex;
  align-items: center;
  gap: 16px;
}}

.brand-logo {{
  width: 54px;
  height: 54px;
  background: #ffffff;
  border-radius: 50%;
  padding: 4px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4), 0 0 0 2px rgba(198, 238, 103, 0.4);
}}

.brand-text {{
  font-size: 32px;
  font-weight: 800;
  color: #ffffff;
  letter-spacing: -0.01em;
}}

.handle-pill {{
  background: rgba(198, 238, 103, 0.12);
  border: 1px solid rgba(198, 238, 103, 0.35);
  color: #c6ee67;
  font-size: 17px;
  font-weight: 700;
  padding: 5px 14px;
  border-radius: 24px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}}

.status-badge {{
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(46, 125, 118, 0.25);
  border: 1px solid rgba(46, 125, 118, 0.45);
  padding: 8px 18px;
  border-radius: 24px;
  font-size: 17px;
  font-weight: 700;
  color: #cbd9d5;
  white-space: nowrap;
}}

.dot {{
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #c6ee67;
  box-shadow: 0 0 10px #c6ee67;
}}

.hero {{
  z-index: 2;
  margin-top: 10px;
}}

.hero h1 {{
  font-size: 52px;
  font-weight: 800;
  line-height: 1.18;
  color: #fbfdfc;
  letter-spacing: -0.02em;
}}

.hero h1 span.highlight {{
  color: #c6ee67;
}}

.hero p.lede {{
  font-size: 21px;
  font-weight: 400;
  color: #b9cec7;
  line-height: 1.5;
  margin-top: 12px;
  max-width: 980px;
}}

.pillars {{
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  z-index: 2;
  margin-top: 8px;
}}

.pillar-card {{
  background: rgba(22, 53, 68, 0.6);
  border: 1px solid rgba(46, 125, 118, 0.4);
  border-radius: 14px;
  padding: 16px 20px;
  backdrop-filter: blur(8px);
}}

.pillar-title {{
  font-size: 19px;
  font-weight: 700;
  color: #eef5f2;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}}

.pillar-title .accent {{
  color: #c6ee67;
}}

.pillar-desc {{
  font-size: 15px;
  color: #9dbab2;
  line-height: 1.45;
}}

.footer-row {{
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 2;
  padding-top: 12px;
  border-top: 1px solid rgba(46, 125, 118, 0.25);
  gap: 16px;
}}

.endpoint-group {{
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}}

.endpoint-box {{
  background: #08141b;
  border: 1px solid rgba(46, 125, 118, 0.5);
  padding: 8px 16px;
  border-radius: 10px;
  color: #c6ee67;
  font-size: 16px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}}

.transport-tag {{
  background: rgba(230, 163, 122, 0.15);
  border: 1px solid rgba(230, 163, 122, 0.4);
  color: #e6a37a;
  font-size: 13px;
  font-weight: 700;
  padding: 6px 12px;
  border-radius: 6px;
  white-space: nowrap;
}}

.compat-tags {{
  display: flex;
  align-items: center;
  gap: 8px;
  color: #8dafa6;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}}

.compat-pill {{
  background: rgba(255, 255, 255, 0.06);
  padding: 4px 10px;
  border-radius: 6px;
  color: #cbd9d5;
}}

.org-tag {{
  color: #b9cec7;
  font-size: 15px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  flex-shrink: 0;
}}
"""

html_ar = f"""<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<style>
{common_styles}
</style>
</head>
<body>
<div class="bg-grid"></div>
<div class="border-frame"></div>

<div class="header">
  <div class="brand">
    <img src="{logo_data_uri}" class="brand-logo" alt="">
    <span class="brand-text">المصادر الإسلامية</span>
    <span class="handle-pill mono" dir="ltr">@IslamicSources</span>
  </div>
  <div class="status-badge">
    <span class="dot"></span>
    <span>أصل رقمي موقوف • 100% مجاني ومفتوح</span>
  </div>
</div>

<div class="hero">
  <h1>كل مصادر المعرفة الإسلامية، <br><span class="highlight">في واجهة موحدة للذكاء الاصطناعي</span></h1>
  <p class="lede">بوابة سحابية حيادية لبروتوكول سياق النماذج (MCP) تجمع القرآن الكريم، والتفاسير المعتمدة، والسنة النبوية، والتراث الإسلامي، والبحث العلمي وتنقلها كما هي بحرفيتها للأدوات والنماذج الذكية.</p>
</div>

<div class="pillars">
  <div class="pillar-card">
    <div class="pillar-title"><span>📖</span> <span class="accent">القرآن والتفاسير</span></div>
    <div class="pillar-desc">مصحف المدينة المنورة، و10+ تفاسير معتمدة (ابن كثير، الطبري، القرطبي...)، واسترجاع دقيق بالآية والسورة.</div>
  </div>
  <div class="pillar-card">
    <div class="pillar-title"><span>📜</span> <span class="accent">الحديث والتراث</span></div>
    <div class="pillar-desc">كتب السنة التسعة، وأحاديث مشروحة مع أحكام المحدثين، ومكتبة تراثية عريضة تفوق 70,000 مجلد.</div>
  </div>
  <div class="pillar-card">
    <div class="pillar-title"><span>🔍</span> <span class="accent">الفهرس والبحث العلمي</span></div>
    <div class="pillar-desc">بحث دلالي فوري وموثق عبر 38+ بوابة ومكتبة ومجمعاً إسلامياً موثوقاً دون وسائط أو تحريف.</div>
  </div>
</div>

<div class="footer-row">
  <div class="endpoint-group">
    <div class="endpoint-box mono" dir="ltr">
      <span style="color:#8dafa6">POST</span> https://mcp.waqf.dev/mcp
    </div>
    <span class="transport-tag mono" dir="ltr">Streamable HTTP & SSE</span>
  </div>
  <div class="compat-tags">
    <span>متوافق مع:</span>
    <span class="compat-pill">Claude</span>
    <span class="compat-pill">Cursor</span>
    <span class="compat-pill">Gemini</span>
    <span class="compat-pill">Cline</span>
    <span class="compat-pill">Goose</span>
  </div>
  <div class="org-tag">
    <span>وقف تك</span>
    <span class="mono" style="color: #c6ee67">WaqfTech();</span>
  </div>
</div>

</body>
</html>"""

html_en = f"""<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<style>
{common_styles}
body {{
  background-image: 
    radial-gradient(circle at 10% 12%, rgba(46, 125, 118, 0.45) 0%, transparent 45%),
    radial-gradient(circle at 90% 90%, rgba(198, 238, 103, 0.15) 0%, transparent 50%),
    radial-gradient(circle at 50% 50%, rgba(17, 43, 56, 1) 0%, #09171f 100%);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, 'Tajawal', sans-serif;
}}
.hero h1 {{
  font-size: 50px;
  line-height: 1.15;
}}
.brand-text {{
  font-family: 'Tajawal', sans-serif;
}}
</style>
</head>
<body>
<div class="bg-grid"></div>
<div class="border-frame"></div>

<div class="header">
  <div class="brand">
    <img src="{logo_data_uri}" class="brand-logo" alt="">
    <span class="brand-text">Islamic Sources</span>
    <span class="handle-pill mono">@IslamicSources</span>
  </div>
  <div class="status-badge">
    <span class="dot"></span>
    <span>Open Digital Waqf • 100% Free & Neutral</span>
  </div>
</div>

<div class="hero">
  <h1>All Islamic Knowledge Sources, <br><span class="highlight">In One Unified AI Interface</span></h1>
  <p class="lede">Edge-native Model Context Protocol (MCP) gateway aggregating authentic Quran, Tafsir, Hadith, and Islamic heritage libraries verbatim with zero alteration for AI assistants and agents.</p>
</div>

<div class="pillars">
  <div class="pillar-card">
    <div class="pillar-title"><span>📖</span> <span class="accent">Quran & Tafsir</span></div>
    <div class="pillar-desc">Authentic Madinah Mus'haf & 10+ classical Tafsir commentaries with verse-level search and retrieval.</div>
  </div>
  <div class="pillar-card">
    <div class="pillar-title"><span>📜</span> <span class="accent">Hadith & Heritage</span></div>
    <div class="pillar-desc">The Nine Hadith Books, verified narrator chains, and 70,000+ volumes of classical Islamic scholarship.</div>
  </div>
  <div class="pillar-card">
    <div class="pillar-title"><span>🔍</span> <span class="accent">Fihris & Search</span></div>
    <div class="pillar-desc">Direct semantic scholarly search across 38+ verified Islamic portals, fatwa councils, and encyclopedias.</div>
  </div>
</div>

<div class="footer-row">
  <div class="endpoint-group">
    <div class="endpoint-box mono">
      <span style="color:#8dafa6">POST</span> https://mcp.waqf.dev/mcp
    </div>
    <span class="transport-tag mono">Streamable HTTP & SSE</span>
  </div>
  <div class="compat-tags">
    <span>Supports:</span>
    <span class="compat-pill">Claude</span>
    <span class="compat-pill">Cursor</span>
    <span class="compat-pill">Gemini</span>
    <span class="compat-pill">Cline</span>
    <span class="compat-pill">Goose</span>
  </div>
  <div class="org-tag">
    <span>Endowed by</span>
    <span class="mono" style="color: #c6ee67">WaqfTech();</span>
  </div>
</div>

</body>
</html>"""

html_touch_icon = f"""<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
body {{
  width: 180px;
  height: 180px;
  background: #112b38;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 40px;
  border: 4px solid rgba(198, 238, 103, 0.4);
}}
.icon-badge {{
  width: 130px;
  height: 130px;
  background: #ffffff;
  border-radius: 50%;
  padding: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
}}
</style>
</head>
<body>
<img src="{logo_data_uri}" class="icon-badge" alt="">
</body>
</html>"""

tmp_dir = "/tmp/waqf-og-build"
os.makedirs(tmp_dir, exist_ok=True)

ar_html_path = os.path.join(tmp_dir, "card_ar.html")
en_html_path = os.path.join(tmp_dir, "card_en.html")
touch_html_path = os.path.join(tmp_dir, "touch.html")

with open(ar_html_path, "w") as f:
    f.write(html_ar)
with open(en_html_path, "w") as f:
    f.write(html_en)
with open(touch_html_path, "w") as f:
    f.write(html_touch_icon)

def run_chrome(html_path, out_png, width, height):
    cmd = [
        "google-chrome",
        "--headless=new",
        "--no-sandbox",
        "--hide-scrollbars",
        f"--window-size={width},{height}",
        f"--screenshot={out_png}",
        f"file://{html_path}",
    ]
    subprocess.run(cmd, check=True)
    print(f"Generated: {out_png}")

run_chrome(ar_html_path, os.path.join(public_dir, "og-image.png"), 1200, 630)
run_chrome(en_html_path, os.path.join(public_dir, "og-image-en.png"), 1200, 630)
run_chrome(touch_html_path, os.path.join(public_dir, "apple-touch-icon.png"), 180, 180)

print("All social preview and touch icon assets regenerated successfully!")
