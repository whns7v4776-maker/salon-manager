import { SalonNameFontVariant } from './platform';

export const appFonts = {
  displayNeon: 'Orbitron_700Bold',
  displayCondensed: 'Rajdhani_700Bold',
  displayPoster: 'BebasNeue_400Regular',
  displayEditorial: 'PlayfairDisplay_700Bold',
  displayScript: 'GreatVibes_400Regular',
} as const;

export type AppFontFamily = (typeof appFonts)[keyof typeof appFonts];

export const salonNameFontOptions: {
  key: SalonNameFontVariant;
  label: string;
  family: AppFontFamily;
}[] = [
  { key: 'neon', label: 'Neon', family: appFonts.displayNeon },
  { key: 'condensed', label: 'Slim', family: appFonts.displayCondensed },
  { key: 'poster', label: 'Poster', family: appFonts.displayPoster },
  { key: 'editorial', label: 'Editoriale', family: appFonts.displayEditorial },
  { key: 'script', label: 'Script', family: appFonts.displayScript },
];

export const resolveSalonNameFontFamily = (
  displayStyle: 'corsivo' | 'stampatello' | 'minuscolo',
  fontVariant: SalonNameFontVariant = 'neon'
): AppFontFamily => {
  if (fontVariant === 'script') return appFonts.displayScript;
  if (fontVariant === 'editorial') return appFonts.displayEditorial;
  if (fontVariant === 'poster') return appFonts.displayPoster;
  if (fontVariant === 'condensed') return appFonts.displayCondensed;
  if (displayStyle === 'minuscolo') return appFonts.displayCondensed;
  return appFonts.displayNeon;
};
