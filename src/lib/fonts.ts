import { SalonNameFontVariant } from './platform';

export const appFonts = {
  displayNeon: 'Orbitron_700Bold',
  displayFuture: 'Orbitron_900Black',
  displayCondensed: 'Rajdhani_700Bold',
  displayMinimal: 'Rajdhani_500Medium',
  displayPoster: 'BebasNeue_400Regular',
  displayEditorial: 'PlayfairDisplay_700Bold',
  displayClassic: 'PlayfairDisplay_600SemiBold_Italic',
  displayLuxury: 'PlayfairDisplay_900Black_Italic',
  displayScript: 'GreatVibes_400Regular',
  displayVogue: 'PlayfairDisplay_900Black',
  displayAtelier: 'PlayfairDisplay_700Bold_Italic',
  displayManrope: 'Manrope_700Bold',
  displayMontserrat: 'Montserrat_600SemiBold',
  displayCinzel: 'Cinzel_600SemiBold',
  displayCormorant: 'CormorantGaramond_600SemiBold_Italic',
  displayParisienne: 'Parisienne_400Regular',
  displayItaliana: 'Italiana_400Regular',
  displayRighteous: 'Righteous_400Regular',
  displayAudiowide: 'Audiowide_400Regular',
} as const;

export type AppFontFamily = (typeof appFonts)[keyof typeof appFonts];

export const salonNameFontOptions: {
  key: SalonNameFontVariant;
  label: string;
  family: AppFontFamily;
}[] = [
  { key: 'neon', label: 'Neon', family: appFonts.displayNeon },
  { key: 'condensed', label: 'Slim', family: appFonts.displayCondensed },
  { key: 'minimal', label: 'Minimal', family: appFonts.displayMinimal },
  { key: 'poster', label: 'Poster', family: appFonts.displayPoster },
  { key: 'future', label: 'Future', family: appFonts.displayFuture },
  { key: 'editorial', label: 'Editoriale', family: appFonts.displayEditorial },
  { key: 'classic', label: 'Classico', family: appFonts.displayClassic },
  { key: 'luxury', label: 'Luxury', family: appFonts.displayLuxury },
  { key: 'script', label: 'Script', family: appFonts.displayScript },
  { key: 'vogue', label: 'Vogue · Scenografico', family: appFonts.displayVogue },
  { key: 'atelier', label: 'Atelier · Corsivo', family: appFonts.displayAtelier },
  { key: 'manrope', label: 'Manrope · Moderno', family: appFonts.displayManrope },
  { key: 'montserrat', label: 'Montserrat · Geometrico', family: appFonts.displayMontserrat },
  { key: 'cinzel', label: 'Cinzel · Maestoso', family: appFonts.displayCinzel },
  { key: 'cormorant', label: 'Cormorant · Sartoriale', family: appFonts.displayCormorant },
  { key: 'parisienne', label: 'Parisienne · Firma', family: appFonts.displayParisienne },
  { key: 'italiana', label: 'Italiana · Raffinato', family: appFonts.displayItaliana },
  { key: 'righteous', label: 'Righteous · Design', family: appFonts.displayRighteous },
  { key: 'audiowide', label: 'Audiowide · Futuristico', family: appFonts.displayAudiowide },
];

export const resolveSalonNameFontFamily = (
  displayStyle: 'corsivo' | 'stampatello' | 'minuscolo',
  fontVariant: SalonNameFontVariant = 'neon'
): AppFontFamily => {
  const additionalFont = salonNameFontOptions.find((option) => option.key === fontVariant);
  if (fontVariant !== 'neon' && additionalFont) return additionalFont.family;
  if (fontVariant === 'vogue') return appFonts.displayVogue;
  if (fontVariant === 'atelier') return appFonts.displayAtelier;
  if (fontVariant === 'script') return appFonts.displayScript;
  if (fontVariant === 'luxury') return appFonts.displayLuxury;
  if (fontVariant === 'classic') return appFonts.displayClassic;
  if (fontVariant === 'editorial') return appFonts.displayEditorial;
  if (fontVariant === 'future') return appFonts.displayFuture;
  if (fontVariant === 'poster') return appFonts.displayPoster;
  if (fontVariant === 'minimal') return appFonts.displayMinimal;
  if (fontVariant === 'condensed') return appFonts.displayCondensed;
  if (displayStyle === 'minuscolo') return appFonts.displayCondensed;
  return appFonts.displayNeon;
};
