const normalise = (value) => {
  if (!value || typeof value !== "string") return "unknown";
  return value.trim().toLowerCase();
};

const hashStringToUnit = (str, seed = 0) => {
  let hash = 2166136261 ^ seed;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  hash += hash << 13;
  hash ^= hash >>> 7;
  hash += hash << 3;
  hash ^= hash >>> 17;
  hash += hash << 5;

  // Convert to unsigned and normalise to [0, 1)
  return (hash >>> 0) / 0xffffffff;
};

const hslToRgb = (h, s, l) => {
  const hue = h / 360;
  const saturation = s / 100;
  const lightness = l / 100;

  if (saturation === 0) {
    const value = Math.round(lightness * 255);
    return { r: value, g: value, b: value };
  }

  const hueToRgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;

  const r = Math.round(hueToRgb(p, q, hue + 1 / 3) * 255);
  const g = Math.round(hueToRgb(p, q, hue) * 255);
  const b = Math.round(hueToRgb(p, q, hue - 1 / 3) * 255);

  return { r, g, b };
};

const rgbToHex = ({ r, g, b }) => {
  const toHex = (value) => value.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const getReadableTextColor = ({ r, g, b }) => {
  const channel = (value) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };

  const luminance =
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

  // Choose dark text for lighter backgrounds, light text otherwise
  return luminance > 0.55 ? "#0f172a" : "#f8fafc";
};

export const getUserColor = (name) => {
  const normalised = normalise(name);
  const hue = Math.round(hashStringToUnit(normalised, 0) * 360) % 360;
  const saturation = 55 + hashStringToUnit(normalised, 1) * 30; // 55% - 85%
  const lightness = 40 + hashStringToUnit(normalised, 2) * 25; // 40% - 65%

  const rgb = hslToRgb(hue, saturation, lightness);
  const main = rgbToHex(rgb);
  const text = getReadableTextColor(rgb);
  const light = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.18)`;

  return {
    main,
    light,
    text,
  };
};

export default getUserColor;
