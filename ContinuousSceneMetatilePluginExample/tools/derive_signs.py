#!/usr/bin/env python3
"""Locate every Sign metatile (id 125) in the compiled (exported) metatile maps
and label each by the nearest named building trigger. Emits a SCENE_SIGNS python
literal for add_sign_interaction.py. Run AFTER `gb-studio-cli export`.

Coords are faced-tile coords (2*mx, 2*my) for a sign at half-res cell (mx,my),
matching what the A-handler leaves in vars 12/13 (METATILE_SIZE_16)."""
import json, re, glob, os, math, sys

PROJ = "project"
EXP = sys.argv[1] if len(sys.argv) > 1 else \
    "C:/Users/micka/AppData/Local/Temp/sign_export/src/data"

SCENES = ['palette_town','viridian_city','pewter_city','cerulean_city','vermillion_city',
          'lavender_town','celadon_city','fuchsia_city','saffron_city','cinabar_island',
          'indigo_plateau']+['route_'+x for x in
          ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17a',
           '17b','18','19','20','21','22','23_a','23_b','24','25']]

# gym leader / type per city (for gym signs)
GYM = {
    "pewter_city":("Brock","Rock"), "cerulean_city":("Misty","Water"),
    "vermillion_city":("Lt. Surge","Electric"), "celadon_city":("Erika","Grass"),
    "fuchsia_city":("Koga","Poison"), "saffron_city":("Sabrina","Psychic"),
    "cinabar_island":("Blaine","Fire"),
}
MATCH_DIST = 14.0  # tiles; a building may claim its nearest sign within this radius

def read_arr(f):
    return [int(x,16) for x in re.findall(r'0x([0-9a-fA-F]{2})', open(f).read())]

def field(f, name):
    m = re.search(r'\.'+name+r'\s*=\s*(\d+)', open(f).read()); return int(m.group(1))

# map scene display name -> exported scene .c (filenames truncate symbols)
name2file = {}
for f in glob.glob(EXP+'/*.c'):
    txt = open(f, encoding='utf-8', errors='ignore').read()
    if 'struct scene_t' in txt:
        m = re.search(r'// Scene:\s*(.+)', txt)
        if m: name2file[m.group(1).strip()] = f

def scene_signs(scene):
    nm = json.load(open(f'{PROJ}/scenes/{scene}/scene.gbsres', encoding='utf-8'))['name']
    scf = name2file[nm]
    bg = re.search(r'\.background\s*=\s*TO_FAR_PTR_T\((bg_[a-z0-9_]+)\)', open(scf).read()).group(1)
    hw = field(f'{EXP}/{bg}.c', 'width') // 2
    tm = read_arr(f'{EXP}/{bg}_tilemap.c')
    return sorted([(i % hw * 2, i // hw * 2) for i, v in enumerate(tm) if v == 125])

def scene_triggers(scene):
    out = []
    for t in glob.glob(f'{PROJ}/scenes/{scene}/triggers/*.gbsres'):
        if t.endswith('.bak'): continue
        d = json.load(open(t, encoding='utf-8'))
        out.append((d.get('name', ''), d.get('x', 0), d.get('y', 0),
                    d.get('width', 2), d.get('height', 2)))
    return out

def wrap_ok(lines):
    for l in lines:
        assert len(l) <= 18, f"line too long ({len(l)}): {l}"
    return lines

def label_for(name, scene):
    n = name.lower()
    if "gym" in n:
        if scene in GYM:
            leader, typ = GYM[scene]
            return [name.split()[0].upper()+" GYM", f"Leader: {leader}", f"{typ} types!"]
        return ["POKEMON GYM", "A tough battle", "awaits inside!"]
    if "pokemon center" in n or "poke center" in n:
        return ["POKEMON CENTER", "Heal your tired", "Pokemon here!"]
    if "mart" in n:
        return ["POKE MART", "Buy useful goods", "for your trip."]
    if "dept" in n:
        return ["DEPT. STORE", "Floors full of", "Pokemon goods!"]
    if "game corner" in n:
        return ["GAME CORNER", "Try your luck", "at the slots!"]
    if "museum" in n:
        return ["MUSEUM", "Of science.", "Fossils within!"]
    if "safari" in n:
        return ["SAFARI ZONE", "Catch rare", "Pokemon inside!"]
    if "silph" in n:
        return ["SILPH CO.", "Makers of fine", "Pokemon gear."]
    if "tower" in n:
        return ["POKEMON TOWER", "Rest in peace,", "lost Pokemon."]
    if "station" in n or "train" in n:
        return ["TRAIN STATION", "All aboard for", "distant towns!"]
    if "bike" in n:
        return ["BIKE SHOP", "Wheels for your", "adventure!"]
    if "hotel" in n:
        return ["POKEMON HOTEL", "Rest a while", "in comfort."]
    if "restaurant" in n:
        return ["RESTAURANT", "A hot meal", "awaits!"]
    if "school" in n or "academy" in n:
        return ["TRAINER SCHOOL", "Learn how to", "battle here!"]
    if "cave" in n:
        if "diglett" in n:
            return ["DIGLETT'S CAVE", "A tunnel for", "small Pokemon."]
        if "cerulean" in n:
            return ["CERULEAN CAVE", "Danger! Strong", "Pokemon ahead."]
        return ["CAVE ENTRANCE", "A dark tunnel", "lies ahead."]
    if "lab" in n:
        if "oak" in n:
            return ["OAK'S LAB", "Pokemon research", "happens here!"]
        return ["POKEMON LAB", "Research in", "progress."]
    if "warden" in n:
        return ["WARDEN'S HOME", "Keeper of the", "Safari Zone."]
    if "fan" in n:
        return ["FAN CLUB", "Pokemon lovers", "welcome!"]
    if "volunteer" in n:
        return ["VOLUNTEER HOUSE", "Helping Pokemon", "in need."]
    # specific named homes
    if "ash" in n or "player" in n:
        return ["YOUR HOUSE", "Home, sweet home."]
    if "rival" in n:
        return ["RIVAL'S HOUSE", "Your rival lives", "here."]
    if "bill" in n:
        return ["BILL'S HOUSE", "The PokeManiac", "lives here."]
    if "house" in n or "home" in n or "building" in n:
        return ["PRIVATE HOME", "Someone lives", "here."]
    return None  # unknown trigger -> leave to area fallback

# Generic Pokemon trainer tips for signs that are neither a building nor the
# town/route name signpost. Sentence case; wrapped to <=18 chars / <=4 lines.
TIPS = [
    "Super effective hits deal more damage!",
    "Heal up free at any Pokemon Center.",
    "Weaken wild Pokemon before you catch them.",
    "Save your game often, trainer!",
    "A balanced team beats a one-trick team.",
    "Stock up on Potions before long routes.",
    "Use Repels to skip weak wild Pokemon.",
    "Teach HMs to reach brand new areas.",
    "Switch Pokemon to dodge bad matchups.",
    "Bring Antidotes where poison lurks.",
    "Trade Pokemon to help some evolve.",
    "Keep a Flying type to fly home fast.",
    "Rest your team before a Gym battle.",
    "Status moves can turn a battle around.",
    "Carry an Escape Rope inside caves.",
    "Higher levels learn stronger moves.",
    "Some Pokemon appear only at night.",
    "Fish by the water for new Pokemon.",
    "Talk to everyone for handy hints.",
    "Catch lots to fill your Pokedex!",
    "A Rare Candy raises a level at once.",
    "Buy Poke Balls before you explore.",
    "Sleeping foes are easier to catch.",
    "Type matchups decide close fights.",
    "Check your bag before a big battle.",
]

def wrap(s, w=18):
    words, lines, cur = s.split(), [], ""
    for word in words:
        assert len(word) <= w, f"word too long: {word!r}"
        if not cur:
            cur = word
        elif len(cur) + 1 + len(word) <= w:
            cur += " " + word
        else:
            lines.append(cur); cur = word
    if cur:
        lines.append(cur)
    assert len(lines) <= 4, f"tip wraps to >4 lines: {s!r} -> {lines}"
    return lines

for _t in TIPS:
    wrap(_t)

def match_scene(scene, signs, triggers):
    """Greedy global assignment: building triggers claim their nearest unclaimed
    sign within MATCH_DIST (closest pairs first). Returns {sign_idx: (lines, name, d)}.
    Leftover signs stay None -> area fallback. Only triggers that resolve to a
    building label participate (edge/route warps are ignored)."""
    buildings = [(label_for(n, scene), n, tx + w/2.0, ty + h/2.0)
                 for (n, tx, ty, w, h) in triggers if label_for(n, scene)]
    pairs = []
    for bi, (lab, name, cx, cy) in enumerate(buildings):
        for si, (sx, sy) in enumerate(signs):
            pairs.append((math.hypot(sx - cx, sy - cy), bi, si))
    pairs.sort()
    used_b, assigned = set(), {}
    for d, bi, si in pairs:
        if d > MATCH_DIST:
            break
        if bi in used_b or si in assigned:
            continue
        used_b.add(bi); assigned[si] = (buildings[bi][0], buildings[bi][1], d)
    return assigned

result = {}
report = []
n_build = n_name = n_tip = total = 0
tip_idx = 0
for sc in SCENES:
    signs = scene_signs(sc)
    trigs = scene_triggers(sc)
    assigned = match_scene(sc, signs, trigs)
    unmatched = [i for i in range(len(signs)) if i not in assigned]
    # the town/route NAME signpost = the entrance-most unmatched sign
    # (southernmost; tie -> western). Every other unmatched sign becomes a tip.
    name_si = max(unmatched, key=lambda i: (signs[i][1], -signs[i][0])) \
        if unmatched else None
    entries = []
    for si, s in enumerate(signs):
        total += 1
        if si in assigned:
            lab, name, d = assigned[si]
            lines = wrap_ok(lab); n_build += 1
            report.append(f"  {sc:12s} {str(s):10s} d={d:4.1f} <- {name!r}")
        elif si == name_si:
            lines = None; n_name += 1                 # None -> area/town name sign
            report.append(f"  {sc:12s} {str(s):10s}            [NAME signpost]")
        else:
            lines = wrap(TIPS[tip_idx % len(TIPS)]); tip_idx += 1; n_tip += 1
            report.append(f"  {sc:12s} {str(s):10s}            tip: {' '.join(lines)}")
        entries.append((s[0], s[1], lines))
    if entries:
        result[sc] = entries

print("\n".join(report))
print(f"\nTotal signs: {total} | buildings: {n_build} | name signposts: {n_name} "
      f"| trainer tips: {n_tip}")

# Emit SCENE_SIGNS python literal (None = show the area/town name sign)
print("\n# ---- SCENE_SIGNS literal ----")
print("SCENE_SIGNS = {")
for sc, entries in result.items():
    print(f"    {sc!r}: [")
    for x, y, lines in entries:
        print(f"        ({x}, {y}, {lines!r}),")
    print("    ],")
print("}")
