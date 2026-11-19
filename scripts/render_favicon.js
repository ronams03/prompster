/* eslint-disable @typescript-eslint/no-require-imports */
// Renders the working SVGs produced by make_favicon.py into crisp PNGs.
const sharp = require("sharp");
const path = require("path");

const SCRIPTS = "/home/z/my-project/scripts";
const PUBLIC = "/home/z/my-project/public";

const jobs = [
  { px: 512, out: "icon-512.png" },
  { px: 192, out: "icon-192.png" },
  { px: 64, out: "icon-64.png" },
  { px: 48, out: "icon-48.png" },
  { px: 32, out: "icon-32.png" },
  { px: 16, out: "icon-16.png" },
  { svg: "_apple.svg", px: 180, out: "apple-touch-icon.png" },
];

(async () => {
  for (const j of jobs) {
    const svgFile = j.svg || `_icon_${j.px}.svg`;
    await sharp(path.join(SCRIPTS, svgFile))
      .png()
      .toFile(path.join(PUBLIC, j.out));
  }
  console.log("PNG RENDER DONE");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
