import { createContext } from "react";
export type ShopTone = { ink: string; soft: string; border: string };
export const shopSectionTone = (id:string,night=false):ShopTone => {
 const group=id==='products'||id==='stock'?'plum':id==='orders'||id==='supply'?'sand':id==='sales'?'sage':'slate';
 const pairs={plum:night?['#D2BED5','#39313C','#645368']:['#79617E','#EEE7EE','#D5C6D6'],sand:night?['#DEC89B','#443D2E','#74654B']:['#816944','#F0E6D0','#D9C7A6'],sage:night?['#A9ABD9','#33344A','#5B5E86']:['#5B5E9A','#E8E8F3','#C9CAE2'],slate:night?['#9DBAD6','#2E3A46','#4D6377']:['#4D6E8F','#E4EBF2','#C2D0DE']};
 const [ink,soft,border]=pairs[group];return {ink,soft,border};
};
export const ShopSectionToneContext = createContext<ShopTone | null>(null);
