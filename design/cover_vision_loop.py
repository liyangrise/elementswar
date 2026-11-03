# -*- coding: utf-8 -*-
"""掩体 / 视锥 / 弹道关系图：验证遮挡与抛物线越障。"""
import math
import os

from PIL import Image, ImageDraw, ImageFont

OUT = r"G:\ElementsWar\design\cover_vision_loop.png"
os.makedirs(os.path.dirname(OUT), exist_ok=True)

W, H = 1320, 890
GX, GY = 44, 108
WW, WH = 1232, 640
BG = (14, 16, 22)
FLOOR = (24, 28, 37)
GRID = (34, 39, 51, 255)
COVER = (74, 82, 102)
COVER_EDGE = (124, 134, 158)
VISION = (255, 214, 130)
PLAYER = (64, 214, 190)
ENEMY = (255, 86, 96)
BULLET = (255, 92, 92)
ARC = (126, 224, 160)
ZONE = (110, 200, 140)

ORIGIN = (250.0, 350.0)      # 玩家世界坐标
FACING = 0.0                 # 朝右
HALF = math.radians(35.0)
RANGE = 520.0

_left = [
    (430, 300, 470, 420),    # 竖墙：挡住正前方视线与子弹
    (330, 486, 424, 516),    # 侧翼矮墙
    (196, 178, 306, 208),    # 玩家侧后掩体
    (560, 560, 648, 598),    # 中场掩体
]
COVERS = list(_left) + [(WW - x2, y1, WW - x1, y2) for (x1, y1, x2, y2) in _left]


def font(size, bold=False):
    cands = []
    if bold:
        cands.append(r"C:\Windows\Fonts\msyhbd.ttc")
    cands += [r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf"]
    for p in cands:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                pass
    return ImageFont.load_default()


def ray_rect(ox, oy, dx, dy, r):
    x1, y1, x2, y2 = r
    tmin, tmax = 0.0, float("inf")
    for o, d, lo, hi in ((ox, dx, x1, x2), (oy, dy, y1, y2)):
        if abs(d) < 1e-9:
            if o < lo or o > hi:
                return None
        else:
            t1, t2 = (lo - o) / d, (hi - o) / d
            if t1 > t2:
                t1, t2 = t2, t1
            tmin = max(tmin, t1)
            tmax = min(tmax, t2)
    if tmax < tmin or tmax <= 0:
        return None
    return tmin if tmin > 0 else tmax


def cast(angle, limit):
    dx, dy = math.cos(angle), math.sin(angle)
    best = limit
    for r in COVERS:
        t = ray_rect(ORIGIN[0], ORIGIN[1], dx, dy, r)
        if t is not None and t < best:
            best = t
    return best


img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img, "RGBA")

d.text((GX, 32), "ElementsWar · 掩体 / 视野 / 弹道 三者的关系", font=font(29, True), fill=(238, 242, 250))
d.text((GX, 72), "掩体挡子弹，也挡视线；抛掷物是唯一能绕过掩体的手段 —— 这条规则决定了整张地图的攻防节奏",
       font=font(15), fill=(132, 142, 162))

# 地板
d.rectangle([GX, GY, GX + WW, GY + WH], fill=FLOOR, outline=(52, 58, 74))
for x in range(0, WW + 1, 44):
    d.line([GX + x, GY, GX + x, GY + WH], fill=GRID, width=1)
for y in range(0, WH + 1, 44):
    d.line([GX, GY + y, GX + WW, GY + y], fill=GRID, width=1)

# 视锥（未遮挡的完整扇形，暗淡）
N = 190
full_pts = [(GX + ORIGIN[0], GY + ORIGIN[1])]
vis_pts = [(GX + ORIGIN[0], GY + ORIGIN[1])]
shadow_pts = []
for i in range(N + 1):
    a = FACING - HALF + (2 * HALF) * i / N
    full_pts.append((GX + ORIGIN[0] + math.cos(a) * RANGE, GY + ORIGIN[1] + math.sin(a) * RANGE))
    t = cast(a, RANGE)
    vis_pts.append((GX + ORIGIN[0] + math.cos(a) * t, GY + ORIGIN[1] + math.sin(a) * t))
    shadow_pts.append((GX + ORIGIN[0] + math.cos(a) * t, GY + ORIGIN[1] + math.sin(a) * t))

d.polygon(full_pts, fill=(255, 214, 130, 16))
d.polygon(vis_pts, fill=(255, 214, 130, 34))

# 阴影区：从遮挡折线向外延伸出扇形边缘，做出"暗带"
sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(sh)
sd.polygon(vis_pts + list(reversed(full_pts)), fill=(6, 8, 12, 118))
img = Image.alpha_composite(img.convert("RGBA"), sh).convert("RGB")
d = ImageDraw.Draw(img, "RGBA")

# 视野边界线
for pts, a in ((full_pts, 60), (vis_pts, 140)):
    d.line(pts, fill=(255, 214, 130, a), width=2)

# 掩体
for (x1, y1, x2, y2) in COVERS:
    d.rectangle([GX + x1, GY + y1, GX + x2, GY + y2], fill=COVER, outline=COVER_EDGE, width=2)
    d.rectangle([GX + x1 + 5, GY + y1 + 5, GX + x2 - 5, GY + y2 - 5], outline=(92, 101, 124))

# 掩体间的连廊提示（对称轴）
d.line([GX + WW / 2, GY + 8, GX + WW / 2, GY + WH - 8], fill=(90, 100, 128, 110), width=2)
d.text((GX + WW / 2 - 62, GY + WH - 30), "镜像对称轴", font=font(13), fill=(110, 122, 148))

# ---- 弹道 1：被掩体挡住的子弹 ----
tgt = (628.0, 350.0)
ang = math.atan2(tgt[1] - ORIGIN[1], tgt[0] - ORIGIN[0])
tb = cast(ang, 900)
bx, by = ORIGIN[0] + math.cos(ang) * tb, ORIGIN[1] + math.sin(ang) * tb
d.line([GX + ORIGIN[0], GY + ORIGIN[1], GX + bx, GY + by], fill=BULLET + (220,), width=3)
d.line([GX + bx - 7, GY + by - 7, GX + bx + 7, GY + by + 7], fill=BULLET + (255,), width=3)
d.line([GX + bx - 7, GY + by + 7, GX + bx + 7, GY + by - 7], fill=BULLET + (255,), width=3)
d.line([GX + bx + 12, GY + by, GX + bx + 92, GY + by], fill=BULLET + (90,), width=2)
d.text((GX + bx + 16, GY + by + 10), "子弹被挡下", font=font(14, True), fill=(255, 132, 132))

# ---- 弹道 2：抛掷物越过掩体 ----
ax, ay = ORIGIN[0] + 20, ORIGIN[1] - 30
lx, ly = 596.0, 318.0
cx, cy = (ax + lx) / 2, (ay + ly) / 2 - 150
pts = []
for i in range(81):
    u = i / 80
    px = (1 - u) ** 2 * ax + 2 * (1 - u) * u * cx + u * u * lx
    py = (1 - u) ** 2 * ay + 2 * (1 - u) * u * cy + u * u * ly
    pts.append((GX + px, GY + py))
for i in range(0, 80, 2):
    d.line([pts[i], pts[i + 1]], fill=ARC + (215,), width=3)
d.ellipse([GX + lx - 70, GY + ly - 70, GX + lx + 70, GY + ly + 70], outline=ZONE + (170,), width=2)
d.ellipse([GX + lx - 70, GY + ly - 70, GX + lx + 70, GY + ly + 70], fill=ZONE + (26,))
d.ellipse([GX + lx - 5, GY + ly - 5, GX + lx + 5, GY + ly + 5], fill=ZONE)
d.text((GX + lx - 44, GY + ly - 96), "抛物线越顶", font=font(14, True), fill=(150, 236, 178))
d.text((GX + lx - 58, GY + ly + 76), "落点生成元素区域", font=font(13), fill=(126, 206, 152))

# ---- 角色 ----
px, py = GX + ORIGIN[0], GY + ORIGIN[1]
d.ellipse([px - 13, py - 13, px + 13, py + 13], fill=PLAYER, outline=(220, 255, 250), width=2)
d.text((px - 8, py - 9), "P", font=font(14, True), fill=(10, 30, 28))

ex, ey = GX + tgt[0], GY + tgt[1]
d.ellipse([ex - 13, ey - 13, ex + 13, ey + 13], fill=ENEMY + (110,), outline=(255, 200, 200, 120), width=2)
d.text((ex - 8, ey - 9), "E", font=font(14, True), fill=(120, 60, 62))

# 可见敌人
ox, oy = 520.0, 250.0
d.ellipse([GX + ox - 12, GY + oy - 12, GX + ox + 12, GY + oy + 12], fill=ENEMY, outline=(255, 200, 200), width=2)
d.text((GX + ox - 7, GY + oy - 9), "E", font=font(13, True), fill=(50, 10, 12))
d.text((GX + ox + 18, GY + oy - 8), "可见", font=font(13), fill=(255, 150, 150))

# ---- 标注 ----
def tag(x, y, text, color, w=None):
    f = font(14, True)
    tw = d.textlength(text, font=f)
    d.rounded_rectangle([x, y, x + tw + 16, y + 26], radius=7, fill=(10, 12, 18, 225), outline=color + (150,))
    d.text((x + 8, y + 4), text, font=f, fill=color)


tag(GX + 150, GY + 118, "视野扇形 70°", (255, 214, 130))
tag(GX + 470, GY + 452, "阴影区：他看不见你，你也看不见他", (170, 178, 198))
tag(GX + 640, GY + 330, "阴影里的敌人：不可见", (255, 120, 130))

# 底部说明条
by = GY + WH + 26
d.rounded_rectangle([GX, by, GX + WW, by + 96], radius=12, fill=(21, 25, 36), outline=(52, 60, 80))
rows = [
    ("① 子弹", "被掩体完全阻挡 —— 掩体是纯粹的「硬安全区」", BULLET),
    ("② 视线", "同样被掩体切断 —— 你蹲在掩体后，也看不见对面", VISION),
    ("③ 抛掷物", "唯一能越过掩体的手段 —— 「在掩体后绝对安全」不成立", ARC),
    ("④ 结果", "掩体给你保护，也给你盲区；元素区域负责把盲区变成战场", ZONE),
]
yy = by + 12
for k, t, c in rows:
    d.text((GX + 18, yy), k, font=font(14, True), fill=c)
    d.text((GX + 96, yy), t, font=font(14), fill=(178, 188, 206))
    yy += 21

img.save(OUT)
print("saved", OUT, img.size)
