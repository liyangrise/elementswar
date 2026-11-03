# -*- coding: utf-8 -*-
"""元素场域模型示意图：区域烘焙 -> 格子裁决。"""
import math
import os

from PIL import Image, ImageDraw, ImageFont

OUT = r"G:\ElementsWar\design\element_field_model.png"
os.makedirs(os.path.dirname(OUT), exist_ok=True)

CW, CH = 1460, 850
BG = (15, 17, 23)
GX, GY = 46, 108
CELL = 19
COLS, ROWS = 52, 30
GW, GH = COLS * CELL, ROWS * CELL

WATER = (47, 143, 224)
FIRE = (255, 106, 26)
ELEC = (162, 75, 255)
C_VAPOR = (224, 250, 255)
C_OVER = (255, 64, 48)
C_SHOCK = (146, 92, 255)
C_TRI = (255, 243, 168)
GRID_LINE = (38, 43, 56, 255)
CELL_BASE = (26, 29, 39)

THETA = 18.0
ZONES = [
    {"k": "w", "x": 262, "y": 302, "r": 176, "s": 50.0, "c": WATER, "n": "水区域"},
    {"k": "f", "x": 492, "y": 206, "r": 176, "s": 50.0, "c": FIRE, "n": "火区域"},
    {"k": "e", "x": 458, "y": 424, "r": 176, "s": 50.0, "c": ELEC, "n": "电区域"},
]


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


def sample(cx, cy):
    v = {"w": 0.0, "f": 0.0, "e": 0.0}
    for z in ZONES:
        d = math.dist((cx, cy), (z["x"], z["y"]))
        if d < z["r"]:
            t = d / z["r"]
            v[z["k"]] += z["s"] * (1.0 - 0.7 * t * t)
    return v


def classify(v):
    act = [k for k in "wfe" if v[k] >= THETA]
    if len(act) == 3:
        return "tri", C_TRI
    s = set(act)
    if s == {"w", "f"}:
        return "vapor", C_VAPOR
    if s == {"f", "e"}:
        return "overload", C_OVER
    if s == {"w", "e"}:
        return "shock", C_SHOCK
    if len(act) == 1:
        return act[0], {"w": WATER, "f": FIRE, "e": ELEC}[act[0]]
    return None, None


def blend(base, over, a):
    return tuple(int(base[i] * (1 - a) + over[i] * a) for i in range(3))


def dashed_circle(dr, cx, cy, r, color, width=2, seg=40, duty=0.62):
    step = 360.0 / seg
    for i in range(seg):
        if (i % 2) == 0:
            dr.arc([cx - r, cy - r, cx + r, cy + r], i * step, i * step + step * duty,
                   fill=color, width=width)


img = Image.new("RGB", (CW, CH), BG)
d = ImageDraw.Draw(img, "RGBA")

# 标题
d.text((GX, 34), "元素场域模型 · 区域烘焙成场，在格子里裁决反应", font=font(30, True), fill=(238, 242, 250))
d.text((GX, 74), "每个格子只关心自己身上叠加了哪些元素、浓度多少；不关心元素来自哪颗手雷",
       font=font(16), fill=(130, 140, 160))

# 场地背板
d.rectangle([GX - 2, GY - 2, GX + GW + 2, GY + GH + 2], fill=CELL_BASE, outline=(52, 58, 74))

stats = {}

for j in range(ROWS):
    for i in range(COLS):
        cx = i * CELL + CELL / 2
        cy = j * CELL + CELL / 2
        x0, y0 = GX + i * CELL, GY + j * CELL
        v = sample(cx, cy)
        kind, col = classify(v)
        cell_rgb = CELL_BASE
        if kind:
            mx = max(v.values())
            a = 0.34 + 0.55 * min(1.0, (mx - THETA) / 34.0)
            a = max(a, 0.34)
            if kind in ("w", "f", "e"):
                a *= 0.72
            cell_rgb = blend(CELL_BASE, col, a)
            stats[kind] = stats.get(kind, 0) + 1
        d.rectangle([x0, y0, x0 + CELL - 1, y0 + CELL - 1], fill=cell_rgb)

# 网格线
for i in range(COLS + 1):
    x = GX + i * CELL
    d.line([x, GY, x, GY + GH], fill=GRID_LINE, width=1)
for j in range(ROWS + 1):
    y = GY + j * CELL
    d.line([GX, y, GX + GW, y], fill=GRID_LINE, width=1)

# 区域轮廓与标签
for z in ZONES:
    cx, cy = GX + z["x"], GY + z["y"]
    dashed_circle(d, cx, cy, z["r"], z["c"] + (210,), width=2)
    d.ellipse([cx - 3, cy - 3, cx + 3, cy + 3], fill=z["c"])
    ang = math.atan2(z["y"] - 308, z["x"] - 403)
    lx = cx + math.cos(ang) * (z["r"] + 22) - 34
    ly = cy + math.sin(ang) * (z["r"] + 22) - 12
    lx = max(GX + 8, min(lx, GX + GW - 78))
    ly = max(GY + 8, min(ly, GY + GH - 34))
    d.rounded_rectangle([lx - 8, ly - 5, lx + 62, ly + 25], radius=8, fill=(10, 12, 18, 220),
                        outline=z["c"] + (160,))
    d.text((lx, ly), z["n"], font=font(15, True), fill=z["c"])

# ---- 右侧图例 ----
LX = GX + GW + 44
d.text((LX, GY - 4), "每格裁决结果", font=font(20, True), fill=(238, 242, 250))
rows = [
    ("tri", "三相共鸣", "水+火+电", "唯一，最高优先级"),
    ("vapor", "蒸发", "水+火", "雾墙遮蔽"),
    ("overload", "超载爆炸", "火+电", "AOE 伤害+击退"),
    ("shock", "感电陷阱", "水+电", "范围麻痹"),
    ("w", "潮湿附着", "仅水", "减速，不反应"),
    ("f", "燃烧附着", "仅火", "持续掉血"),
    ("e", "触电附着", "仅电", "短暂麻痹"),
]
y = GY + 34
for key, name, formula, note in rows:
    col = {"tri": C_TRI, "vapor": C_VAPOR, "overload": C_OVER, "shock": C_SHOCK,
           "w": WATER, "f": FIRE, "e": ELEC}[key]
    d.rounded_rectangle([LX, y, LX + 26, y + 26], radius=6, fill=blend(CELL_BASE, col, 0.72))
    d.text((LX + 38, y - 3), name, font=font(17, True), fill=(226, 232, 244))
    d.text((LX + 38, y + 19), formula, font=font(13), fill=blend((0, 0, 0), col, 0) and col)
    d.text((LX + 118, y + 17), note, font=font(13), fill=(124, 134, 154))
    y += 62

# 优先级说明
y += 6
d.line([LX, y, LX + 316, y], fill=(48, 54, 70), width=1)
y += 14
d.text((LX, y), "裁决顺序", font=font(16, True), fill=(238, 242, 250))
y += 28
for t, c in [("1. 三种元素都过阈值 → 只触发三相共鸣", C_TRI),
             ("2. 两种过阈值 → 触发对应双相反应", (200, 208, 224)),
             ("3. 一种 → 只做属性附着，不反应", (150, 160, 180)),
             ("4. 同格冷却中 → 只扣浓度，不触发", (150, 160, 180))]:
    d.text((LX, y), t, font=font(13), fill=c)
    y += 24

# ---- 底部结论条 ----
by = GY + GH + 24
d.rounded_rectangle([GX, by, GX + GW, by + 54], radius=10, fill=(22, 26, 38), outline=(52, 60, 80))
d.text((GX + 18, by + 8), "同格叠两团火 ≠ 伤害×2", font=font(17, True), fill=(255, 176, 96))
d.text((GX + 18, by + 31), "火浓度更高 → 单次反应后仍有剩余 → 冷却结束再触发一次；雾区更久、更浓，但单次伤害只有轻微加成。",
       font=font(14), fill=(176, 186, 204))

# 统计
d.text((CW - 250, CH - 26), "示意：3 个圆形手雷区域 @ 20px 网格", font=font(12), fill=(92, 100, 118))

img.save(OUT)
print("saved", OUT, img.size)
print({k: v for k, v in sorted(stats.items())})
