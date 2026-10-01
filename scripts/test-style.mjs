import { readFile } from "node:fs/promises";

const css = await readFile("src/style.css", "utf8");
const selector =
  "button.assignment-swap-control:hover:not(:disabled),\nbutton.assignment-swap-control:focus-visible";
const rule = new RegExp(
  `${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
);
const match = css.match(rule);

if (!match || !/background:\s*#263244\s*;/.test(match[1])) {
  throw new Error(
    "Swap-control hover and visible focus must retain their dark background.",
  );
}
if (!/outline:\s*2px solid #f9bd4055\s*;/.test(match[1])) {
  throw new Error("Swap-control visible focus must retain its focus outline.");
}

function relativeLuminance(hex) {
  const channels = hex.match(/\w\w/g).map((channel) => parseInt(channel, 16));
  return channels
    .map((channel) => {
      const value = channel / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    })
    .reduce(
      (luminance, channel, index) =>
        luminance + channel * [0.2126, 0.7152, 0.0722][index],
      0,
    );
}

const foreground = relativeLuminance("f4f3f0");
const background = relativeLuminance("263244");
const contrast =
  (Math.max(foreground, background) + 0.05) /
  (Math.min(foreground, background) + 0.05);

if (contrast < 4.5) {
  throw new Error(
    `Swap-control text contrast is only ${contrast.toFixed(2)}:1.`,
  );
}

console.log(
  `Swap-control hover and focus retain a ${contrast.toFixed(2)}:1 text contrast.`,
);
