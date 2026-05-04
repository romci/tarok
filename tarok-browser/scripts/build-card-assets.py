from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "assets/cards/source-sheets"
FACE_DIR = ROOT / "assets/cards/faces"
FRONT_SPRITE = ROOT / "assets/cards/fronts-sprite.png"

CARD_W = 200
CARD_H = 336
SPRITE_COLUMNS = 9

RED_SHEET = SOURCE_DIR / "red-suits.png"
BLACK_SHEET = SOURCE_DIR / "black-suits.png"
TAROK_SHEET = SOURCE_DIR / "taroks.png"

TAROK_IDS = [f"T{number}" for number in range(1, 21)] + ["T21", "SKIS"]
SUITS = [
    ("clubs", "C", ["K", "Q", "N", "J", "10", "9", "8", "7"]),
    ("spades", "S", ["K", "Q", "N", "J", "10", "9", "8", "7"]),
    ("hearts", "H", ["K", "Q", "N", "J", "4", "3", "2", "1"]),
    ("diamonds", "D", ["K", "Q", "N", "J", "4", "3", "2", "1"]),
]
CARD_IDS = TAROK_IDS + [
    f"{short}{rank}"
    for _, short, ranks in SUITS
    for rank in ranks
]

RED_X = [(14, 246), (261, 488), (502, 728), (743, 966), (981, 1203), (1220, 1441), (1456, 1673), (1689, 1902)]
RED_Y = [(11, 403), (415, 809)]
BLACK_X = [(20, 249), (267, 490), (507, 730), (748, 967), (985, 1203), (1221, 1439), (1456, 1672), (1691, 1898)]
BLACK_Y = [(20, 400), (415, 798)]
TAROK_ROWS = [
    ((25, 336), [(29, 199), (216, 385), (405, 573), (592, 762), (781, 950), (968, 1136)]),
    ((351, 662), [(29, 199), (217, 385), (404, 573), (592, 762), (780, 948), (965, 1137)]),
    ((676, 989), [(29, 199), (217, 385), (404, 573), (592, 761), (780, 948), (967, 1135)]),
    ((1005, 1314), [(83, 257), (278, 455), (478, 653), (675, 850), (871, 1043)]),
]


def normalize_card(image):
    image = image.convert("RGBA")
    image.thumbnail((CARD_W, CARD_H), Image.Resampling.LANCZOS)
    card = Image.new("RGBA", (CARD_W, CARD_H), (255, 255, 255, 0))
    left = (CARD_W - image.width) // 2
    top = (CARD_H - image.height) // 2
    card.paste(image, (left, top), image)
    return card


def crop_card(sheet, x_range, y_range):
    x0, x1 = x_range
    y0, y1 = y_range
    pad = 2
    crop = sheet.crop((max(0, x0 - pad), max(0, y0 - pad), min(sheet.width, x1 + pad), min(sheet.height, y1 + pad)))
    return normalize_card(crop)


def build_taroks():
    sheet = Image.open(TAROK_SHEET).convert("RGB")
    source_cells = []
    for y_range, x_ranges in TAROK_ROWS:
        source_cells.extend((x_range, y_range) for x_range in x_ranges)

    # Last row: XIX, XX, XXI (Mond), a duplicate “XXII” (wrong art — skip), then ŠKIS.
    # Game deck: T21 = Mond (XXI), SKIS = Škis (22nd trump; use ŠKIS cell, not the XXII cell).
    source_indexes = list(range(20)) + [20, 22]
    for card_id, source_index in zip(TAROK_IDS, source_indexes):
        x_range, y_range = source_cells[source_index]
        crop_card(sheet, x_range, y_range).save(FACE_DIR / f"{card_id}.png")


def build_suit_sheet(path, x_ranges, y_ranges, rows):
    sheet = Image.open(path).convert("RGB")
    for row_index, (short, ranks) in enumerate(rows):
        y_range = y_ranges[row_index]
        for x_range, rank in zip(x_ranges, ranks):
            crop_card(sheet, x_range, y_range).save(FACE_DIR / f"{short}{rank}.png")


def build_suits():
    build_suit_sheet(BLACK_SHEET, BLACK_X, BLACK_Y, [
        ("S", ["K", "Q", "N", "J", "10", "9", "8", "7"]),
        ("C", ["K", "Q", "N", "J", "10", "9", "8", "7"]),
    ])
    build_suit_sheet(RED_SHEET, RED_X, RED_Y, [
        ("H", ["K", "Q", "N", "J", "4", "3", "2", "1"]),
        ("D", ["K", "Q", "N", "J", "4", "3", "2", "1"]),
    ])


def build_front_sprite():
    rows = (len(CARD_IDS) + SPRITE_COLUMNS - 1) // SPRITE_COLUMNS
    sprite = Image.new("RGBA", (SPRITE_COLUMNS * CARD_W, rows * CARD_H), (0, 0, 0, 0))
    for index, card_id in enumerate(CARD_IDS):
        card = Image.open(FACE_DIR / f"{card_id}.png").convert("RGBA")
        x = (index % SPRITE_COLUMNS) * CARD_W
        y = (index // SPRITE_COLUMNS) * CARD_H
        sprite.paste(card, (x, y), card)
    sprite.save(FRONT_SPRITE, optimize=True)


def main():
    FACE_DIR.mkdir(parents=True, exist_ok=True)
    build_taroks()
    build_suits()
    build_front_sprite()


if __name__ == "__main__":
    main()
