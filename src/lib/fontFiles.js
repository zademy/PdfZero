// Font binaries for the custom families in fontRegistry.js, imported as Vite
// asset URLs (emitted verbatim to dist/, fetched lazily only when an export
// actually needs that family). Kept apart from fontRegistry.js so the
// registry stays plain, side-effect-free data that any module (or test) can
// import without pulling font assets.
//
// @expo-google-fonts/* packages ship full, unrestricted TTFs (SIL OFL).
// Italic variants are not embedded yet (regular/bold only): italic text
// exported in a custom family falls back to its upright weight. Base-14
// families keep native italic/oblique variants.

import NotoSansRegular from "@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf?url";
import NotoSansBold from "@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf?url";
import NotoSerifRegular from "@expo-google-fonts/noto-serif/400Regular/NotoSerif_400Regular.ttf?url";
import NotoSerifBold from "@expo-google-fonts/noto-serif/700Bold/NotoSerif_700Bold.ttf?url";
import LatoRegular from "@expo-google-fonts/lato/400Regular/Lato_400Regular.ttf?url";
import LatoBold from "@expo-google-fonts/lato/700Bold/Lato_700Bold.ttf?url";
import MerriweatherRegular from "@expo-google-fonts/merriweather/400Regular/Merriweather_400Regular.ttf?url";
import MerriweatherBold from "@expo-google-fonts/merriweather/700Bold/Merriweather_700Bold.ttf?url";

const FILES = {
  NotoSans: { regular: NotoSansRegular, bold: NotoSansBold },
  NotoSerif: { regular: NotoSerifRegular, bold: NotoSerifBold },
  Lato: { regular: LatoRegular, bold: LatoBold },
  Merriweather: { regular: MerriweatherRegular, bold: MerriweatherBold },
};

// url → Promise<ArrayBuffer> cache: each family file is fetched at most once
// per session, only on first export that uses it.
const bytesCache = new Map();

export function getCustomFontUrl(family, { bold = false } = {}) {
  const files = FILES[family];
  if (!files) return null;
  return bold ? files.bold : files.regular;
}

export async function getCustomFontBytes(family, { bold = false } = {}) {
  const url = getCustomFontUrl(family, { bold });
  if (!url) return null;
  if (!bytesCache.has(url)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load font asset ${family}`);
    bytesCache.set(url, await res.arrayBuffer());
  }
  return bytesCache.get(url);
}
