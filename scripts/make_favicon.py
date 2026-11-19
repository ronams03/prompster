#!/usr/bin/env python3
"""Generate SKILL FOUNDRY branded favicons.

Design: forge-ink rounded square, citron blocky "SF" monogram with an
orange hard-offset shadow — matching the app's neo-brutalist header mark.
Outputs: public/icon.svg, public/icon-{512,192,64,48,32,16}.png,
public/apple-touch-icon.png, public/favicon.ico (16/32/48 layers).
"""
import subprocess
from pathlib import Path

PROJ = Path("/home/z/my-project")
PUBLIC = PROJ / "public"
SCRIPTS = PROJ / "scripts"

INK = "#111111"
LIME = "#C6F432"
ORANGE = "#FF5C1F"

# Chunky pixel letters on a 64-grid (all rects) so no font is needed.
# Reads "SF" left-to-right: S first, then F. S: classic 5-row blocky S.
LETTER_RECTS = [
    # S (left)
    (14, 16, 17, 7),   # top bar
    (14, 23, 7, 6),    # upper-left stem
    (14, 29, 17, 6),   # mid bar
    (24, 35, 7, 6),    # lower-right stem
    (14, 41, 17, 7),   # bottom bar
    # F (right)
    (33, 16, 7, 32),   # stem
    (33, 16, 15, 7),   # top bar
    (33, 29, 12, 6),   # mid bar
]


def rects_svg(dx: float, dy: float, fill: str) -> str:
    return "".join(
        f'<rect x="{x + dx}" y="{y + dy}" width="{w}" height="{h}" fill="{fill}"/>'
        for x, y, w, h in LETTER_RECTS
    )


def build_svg(size: int, rounded: bool) -> str:
    if rounded:
        bg = f'<rect x="2" y="2" width="60" height="60" rx="13" fill="{INK}"/>'
    else:
        bg = f'<rect x="0" y="0" width="64" height="64" fill="{INK}"/>'
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" '
        f'width="{size}" height="{size}">'
        f"{bg}"
        f"{rects_svg(3, 3, ORANGE)}"
        f"{rects_svg(0, 0, LIME)}"
        f"</svg>"
    )


def main() -> None:
    PUBLIC.mkdir(exist_ok=True)

    # 1) Master SVG favicon (rounded mark)
    icon_svg = build_svg(64, rounded=True)
    (PUBLIC / "icon.svg").write_text(icon_svg)

    # 2) Per-size working SVGs -> sharp renders crisp PNGs
    render_jobs = []
    for px in (512, 192, 64, 48, 32, 16):
        svg_path = SCRIPTS / f"_icon_{px}.svg"
        svg_path.write_text(build_svg(px, rounded=True))
        render_jobs.append((svg_path, PUBLIC / f"icon-{px}.png"))
    apple_svg = SCRIPTS / "_apple.svg"
    apple_svg.write_text(build_svg(180, rounded=False))
    render_jobs.append((apple_svg, PUBLIC / "apple-touch-icon.png"))

    script = SCRIPTS / "render_favicon.js"
    subprocess.run(["node", str(script)], check=True, cwd=str(PROJ))

    # 3) Multi-layer .ico from the crisp 48px render
    from PIL import Image  # noqa: PLC0415

    src = Image.open(PUBLIC / "icon-48.png").convert("RGBA")
    src.save(
        PUBLIC / "favicon.ico",
        sizes=[(16, 16), (32, 32), (48, 48)],
        format="ICO",
    )

    for f in sorted(PUBLIC.glob("icon*")) + [PUBLIC / "favicon.ico", PUBLIC / "apple-touch-icon.png"]:
        print(f"{f.name:24s} {f.stat().st_size:7d} bytes")
    print("FAVICONS DONE")


if __name__ == "__main__":
    main()
