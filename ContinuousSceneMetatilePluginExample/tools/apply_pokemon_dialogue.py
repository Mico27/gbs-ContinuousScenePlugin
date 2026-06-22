#!/usr/bin/env python3
"""Regenerate every actor's dialogue so it is relevant to the actor's prefab
archetype AND the scene it stands in. Sentence case (not ALL CAPS), 1-4 content
lines (each <=18 chars / one display line), separated by blank lines, all using
the PokemonDisplayPreset. Every message is unique across the whole project."""
import json, glob, os, random

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "project"))
PRESET_ID = "b5f85a5b-5f40-4355-9e63-db5ce2bfe0bc"
LINE_W = 18          # max chars per display line
MAX_LINES = 4        # max content lines (not counting blank separators)

PRESET_ARGS = {
    "minHeight": 6, "maxHeight": 6, "textX": 1, "textY": 1, "textHeight": 4,
    "position": "bottom", "clearPrevious": True, "showFrame": "true",
    "speedIn": -3, "speedOut": -3, "closeWhen": "key", "closeButton": "a",
    "closeDelayTime": 0.5, "closeDelayFrames": 30,
}

# prefab id -> (archetype, EVENT_TEXT event id, generic prefab-default line)
PREFABS = {
    "7c9b1d79-58bc-424c-aa5f-bb7970181adb": ("gym_leader_m",   "89f2213b-37ec-44b8-80d9-3eafc0c68a26", "I'm a tough gym trainer. Care to battle?"),
    "8a822eae-0622-4e35-9340-eaa66baa23fd": ("old_man",        "b09a6ede-ea52-4e75-aba3-ae45d7680986", "Back in my day, we walked everywhere!"),
    "29f678cd-1e78-40ee-add0-224b5a74b9b5": ("pokemon_fan",    "232a9658-d1c1-4a1e-ab17-2aa84c3cb0c9", "I just love every kind of Pokemon!"),
    "06ae6eda-4908-4911-a72d-a8429b7f46cb": ("police_officer", "b8e46792-201f-449c-b2e1-e00814bd56bb", "I keep the peace around here."),
    "ff14efd8-6fff-48cb-96c2-f511a957a54e": ("scientist",      "5776b507-7a2f-4d92-af05-82586b6230ea", "I research Pokemon for a living."),
    "bc3c58a2-4f00-402e-a099-4e1c0d4047b5": ("sign_post",      "c468c208-c496-405a-9828-09f3f05a8d81", "Read me for local info."),
    "07c54d65-8bda-48af-afaf-2eb8d034f1fe": ("swimmer",        "0d0dad95-70cd-44b6-95b7-f8bbf3799dac", "The water is perfect for a swim!"),
    "d32eadab-5e78-413c-aa1c-d31e0f56f4d3": ("young_trainer_f","4959baa7-e57b-4ae9-92a9-96849b01566c", "I'm training to be the very best!"),
    "272e5f1e-7e39-4463-aaaf-29eb2a8fd3d5": ("young_trainer_m","461e9d5e-217e-4dea-ba4c-f1bdfa8075a5", "Let's have a Pokemon battle!"),
}

# scene folder -> metadata. gym = (leader, type) or None. landmark in mid-sentence form.
SCENES = {
    "palette_town":   {"name": "Pallet Town",     "landmark": "Professor Oak's lab", "gym": None,                    "kind": "town"},
    "viridian_city":  {"name": "Viridian City",   "landmark": "the forest gate",     "gym": None,                    "kind": "city"},
    "pewter_city":    {"name": "Pewter City",     "landmark": "the museum",          "gym": ("Brock", "Rock"),       "kind": "city"},
    "cerulean_city":  {"name": "Cerulean City",   "landmark": "the cape",            "gym": ("Misty", "Water"),      "kind": "city"},
    "vermillion_city":{"name": "Vermilion City",  "landmark": "the harbor",          "gym": ("Lt. Surge", "Electric"),"kind": "city"},
    "lavender_town":  {"name": "Lavender Town",   "landmark": "the Pokemon Tower",   "gym": None,                    "kind": "town"},
    "celadon_city":   {"name": "Celadon City",    "landmark": "the big store",       "gym": ("Erika", "Grass"),      "kind": "city"},
    "fuchsia_city":   {"name": "Fuchsia City",    "landmark": "the Safari Zone",     "gym": ("Koga", "Poison"),      "kind": "city"},
    "saffron_city":   {"name": "Saffron City",    "landmark": "Silph Co.",           "gym": ("Sabrina", "Psychic"),  "kind": "city"},
    "cinabar_island": {"name": "Cinnabar Island", "landmark": "the old mansion",     "gym": ("Blaine", "Fire"),      "kind": "city"},
    "indigo_plateau": {"name": "Indigo Plateau",  "landmark": "the Pokemon League",  "gym": None,                    "kind": "league"},
    "route_1":  {"name": "Route 1",  "landmark": "the tall grass",       "gym": None, "kind": "route"},
    "route_2":  {"name": "Route 2",  "landmark": "Viridian Forest",      "gym": None, "kind": "route"},
    "route_3":  {"name": "Route 3",  "landmark": "Mt. Moon",             "gym": None, "kind": "route"},
    "route_4":  {"name": "Route 4",  "landmark": "Mt. Moon",             "gym": None, "kind": "route"},
    "route_5":  {"name": "Route 5",  "landmark": "the underground path", "gym": None, "kind": "route"},
    "route_6":  {"name": "Route 6",  "landmark": "the quiet ponds",      "gym": None, "kind": "route"},
    "route_7":  {"name": "Route 7",  "landmark": "the city gate",        "gym": None, "kind": "route"},
    "route_8":  {"name": "Route 8",  "landmark": "the underground path", "gym": None, "kind": "route"},
    "route_9":  {"name": "Route 9",  "landmark": "Rock Tunnel",          "gym": None, "kind": "route"},
    "route_10": {"name": "Route 10", "landmark": "Rock Tunnel",          "gym": None, "kind": "route"},
    "route_11": {"name": "Route 11", "landmark": "Diglett's Cave",       "gym": None, "kind": "route"},
    "route_12": {"name": "Route 12", "landmark": "the long bridge",      "gym": None, "kind": "route"},
    "route_13": {"name": "Route 13", "landmark": "the winding path",     "gym": None, "kind": "route"},
    "route_14": {"name": "Route 14", "landmark": "the hedge maze",       "gym": None, "kind": "route"},
    "route_15": {"name": "Route 15", "landmark": "the gate house",       "gym": None, "kind": "route"},
    "route_16": {"name": "Route 16", "landmark": "Cycling Road",         "gym": None, "kind": "route"},
    "route_17a":{"name": "Route 17", "landmark": "Cycling Road",         "gym": None, "kind": "route"},
    "route_17b":{"name": "Route 17", "landmark": "Cycling Road",         "gym": None, "kind": "route"},
    "route_18": {"name": "Route 18", "landmark": "the east gate",        "gym": None, "kind": "route"},
    "route_19": {"name": "Route 19", "landmark": "the open sea",         "gym": None, "kind": "route"},
    "route_20": {"name": "Route 20", "landmark": "Seafoam Islands",      "gym": None, "kind": "route"},
    "route_21": {"name": "Route 21", "landmark": "the open sea",         "gym": None, "kind": "route"},
    "route_22": {"name": "Route 22", "landmark": "the league gate",      "gym": None, "kind": "route"},
    "route_23_a":{"name": "Route 23","landmark": "Victory Road",         "gym": None, "kind": "route"},
    "route_23_b":{"name": "Route 23","landmark": "Victory Road",         "gym": None, "kind": "route"},
    "route_24": {"name": "Route 24", "landmark": "Nugget Bridge",        "gym": None, "kind": "route"},
    "route_25": {"name": "Route 25", "landmark": "the sea cape",         "gym": None, "kind": "route"},
}

def cap1(s):
    return s[:1].upper() + s[1:]

def templates(arch, m):
    """Return candidate lines. Route NPCs lean on the landmark or 'here' rather
    than the route number; cities/towns/league/signs may name the place."""
    n = m["name"]; lm = m["landmark"]; gym = m["gym"]; kind = m["kind"]
    if arch == "gym_leader_m":
        if kind == "league":
            return [f"The Pokemon League at {n} is the ultimate test!",
                    "Only true champions reach this far.",
                    "Train hard before the Elite Four.",
                    f"None shall pass {n} unproven."]
        if gym:
            leader, typ = gym
            return [f"Welcome to the {n} gym! My {typ} types are fierce.",
                    f"{leader} leads the gym here in {n}.",
                    f"Beat me to earn your {n} badge!",
                    f"My {typ} Pokemon are the pride of {n}.",
                    f"Can you handle {leader}'s {typ} team?"]
        return ["I'm a veteran of countless battles.",
                "I battle every challenger who passes.",
                "Respect a trainer who has seen it all.",
                "I earned my badges years ago.",
                "Few rookies can match my power.",
                "Care to test your team against mine?"]
    if arch == "old_man":
        return ["Back in my day, this trail was quieter.",
                "I have wandered these parts for years.",
                "Let an old man rest his weary legs.",
                f"{cap1(lm)} brings back fond memories.",
                "Mind the wild Pokemon out here, youngster.",
                "I recall when no trainers came this way.",
                "These old bones know this place well.",
                f"I often stroll past {lm}.",
                "Youngsters today rush about so much.",
                f"I have lived near {n} all my life."]
    if arch == "pokemon_fan":
        return ["I love the Pokemon found around here!",
                f"The Pokemon near {lm} are adorable!",
                "I came a long way to see rare Pokemon.",
                "This place is a Pokemon fan's dream!",
                "I want to befriend every Pokemon here.",
                f"My favorite Pokemon lives by {lm}.",
                "Pokemon are the best, aren't they?",
                "I sketch every Pokemon I meet.",
                f"{n} is a fan's paradise!"]
    if arch == "police_officer":
        return ["I patrol this area to keep you safe.",
                "Team Rocket was seen near here lately.",
                "Move along now, all is calm here.",
                "Report any trouble to me at once.",
                f"It is my duty to guard {lm}.",
                "No funny business on my watch!",
                "Stay alert in the tall grass out there.",
                "I keep a close eye on these parts.",
                f"I keep the peace here in {n}."]
    if arch == "scientist":
        return ["I'm researching the Pokemon found here.",
                "My field data is nearly complete.",
                "Evolution never ceases to amaze me.",
                f"{cap1(lm)} hides scientific wonders.",
                "I study rare specimens in this area.",
                "I track wild Pokemon habits out here.",
                "My latest findings are exciting!",
                f"I am sampling soil near {lm}.",
                "Every Pokemon holds a mystery.",
                f"The Pokemon of {n} intrigue me."]
    if arch == "sign_post":
        return [f"{n}: {cap1(lm)} lies ahead.",
                f"Now entering {n}.",
                f"{n} - protect wild Pokemon.",
                f"Trail sign: {cap1(lm)} ahead.",
                f"Welcome to {n}."]
    if arch == "swimmer":
        return ["The water here is wonderful!",
                "Great waves are rolling in today.",
                f"Water Pokemon thrive near {lm}.",
                "Care for a swim out here?",
                f"I love diving by {lm}.",
                "I swam a long way to reach here!",
                "The sea breeze feels amazing!",
                "Nothing beats a morning swim.",
                f"The waters off {n} are calm."]
    if arch == "young_trainer_f":
        return ["I caught my first Pokemon here!",
                "I'm training hard in this area.",
                "Wanna battle right here?",
                "One day I'll be the very best!",
                f"I love training near {lm}.",
                "My Pokemon grow stronger daily.",
                "I won't lose to anyone today!",
                "My Bulbasaur is getting tough!",
                f"{n} is my favorite spot."]
    if arch == "young_trainer_m":
        return ["I'm the toughest kid around here!",
                "Let's battle right now!",
                f"I train every day near {lm}.",
                "I'll catch them all out here!",
                "No one can beat me today!",
                "My team is getting stronger!",
                "I dream of becoming a champion!",
                "My Charmander never backs down!",
                f"{n} made me a real trainer."]
    raise ValueError(arch)

def wrap(s, width=LINE_W):
    words = s.split()
    lines, cur = [], ""
    for w in words:
        assert len(w) <= width, f"word too long: {w!r}"
        if not cur:
            cur = w
        elif len(cur) + 1 + len(w) <= width:
            cur += " " + w
        else:
            lines.append(cur); cur = w
    if cur:
        lines.append(cur)
    return lines

used = set()

def format_msg(sentence):
    lines = wrap(sentence)
    if len(lines) > MAX_LINES:
        return None
    msg = "\n\n".join(lines)
    return msg if msg not in used else None

def pick(arch, scene_key):
    """Choose a unique, well-fitting message for this archetype in this scene.
    On routes (except signposts) avoid candidates that name the route number."""
    m = SCENES[scene_key]
    name = m["name"]
    cands = templates(arch, m)
    rng = random.Random(f"{arch}|{scene_key}|v2|20260621")
    rng.shuffle(cands)
    if m["kind"] == "route" and arch != "sign_post":
        order = [c for c in cands if name not in c]  # never say the route number
    else:
        order = [c for c in cands if name not in c] + [c for c in cands if name in c]
    for s in order:
        msg = format_msg(s)
        if msg:
            used.add(msg)
            return msg
    # Name-free uniqueness fallback (never reintroduces the route number).
    for extra in (" A fine spot, truly.", " Quite a place, this.",
                  " I never tire of it.", " Such peaceful days."):
        for s in order:
            msg = format_msg(s + extra)
            if msg:
                used.add(msg)
                return msg
    raise RuntimeError(f"no unique message for {arch} in {scene_key}")

def make_text_args(msg):
    a = {"__presetId": PRESET_ID, "text": [msg], "__section": "presets", "avatarId": ""}
    a.update(PRESET_ARGS)
    return a

def load(f):
    with open(f, encoding="utf-8") as fh:
        return json.load(fh)

def save(f, d):
    with open(f, "w", encoding="utf-8") as fh:
        json.dump(d, fh, indent=2, ensure_ascii=False)
        fh.write("\n")

SCRIPT_KEYS = ("script", "startScript", "updateScript", "hit1Script", "hit2Script", "hit3Script")

def find_text_events(d):
    out = []
    def scan(ev):
        if isinstance(ev, dict):
            if ev.get("command") == "EVENT_TEXT":
                out.append(ev)
            ch = ev.get("children")
            if isinstance(ch, dict):
                for v in ch.values():
                    for e in (v or []):
                        scan(e)
    for key in SCRIPT_KEYS:
        for ev in d.get(key) or []:
            scan(ev)
    return out

summary = {"prefabs": 0, "actor_overrides": 0, "actor_own": 0, "skipped_no_text": 0}

# 1. prefab default lines (generic, archetype-relevant, sentence case)
for f in sorted(glob.glob(os.path.join(ROOT, "prefabs", "actors", "*.gbsres"))):
    d = load(f)
    pid = d.get("id")
    if pid not in PREFABS:
        continue
    _, _, generic = PREFABS[pid]
    msg = format_msg(generic)
    assert msg, f"prefab generic collided/too long: {generic}"
    used.add(msg)
    for ev in find_text_events(d):
        ev["args"] = make_text_args(msg)
    save(f, d)
    summary["prefabs"] += 1

# 2. scene actors
for f in sorted(glob.glob(os.path.join(ROOT, "scenes", "*", "actors", "*.gbsres"))):
    d = load(f)
    scene_key = f.replace("\\", "/").split("/scenes/")[1].split("/")[0]
    changed = False
    pid = d.get("prefabId")
    own = find_text_events(d)
    if own:
        # standalone actor with its own EVENT_TEXT (Pallet Town townsperson)
        msg = format_msg("Welcome to Pallet Town! Your adventure begins here.")
        if not msg:
            msg = pick("old_man", scene_key)
        else:
            used.add(msg)
        for ev in own:
            ev["args"] = make_text_args(msg)
        changed = True
        summary["actor_own"] += 1
    if pid in PREFABS and SCENES.get(scene_key):
        arch, evid, _ = PREFABS[pid]
        msg = pick(arch, scene_key)
        ov = d.setdefault("prefabScriptOverrides", {})
        entry = ov.get(evid, {"id": evid, "args": {}})
        entry["id"] = evid
        entry.setdefault("args", {})
        entry["args"]["text"] = [msg]
        ov[evid] = entry
        changed = True
        summary["actor_overrides"] += 1
    elif pid and pid not in PREFABS and not own:
        summary["skipped_no_text"] += 1
    if changed:
        save(f, d)

print(json.dumps(summary, indent=2))
print("unique messages:", len(used))
