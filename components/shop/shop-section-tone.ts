import { createContext } from "react";
export type ShopTone = { ink: string; soft: string; border: string };
export const shopSectionTone = (id:string,night=false):ShopTone => {
 const group=id==='products'||id==='stock'?'plum':id==='orders'||id==='supply'?'sand':id==='sales'?'sage':'slate';
 const pairs={plum:night?['#D2BED5','#39313C','#645368']:['#79617E','#EEE7EE','#D5C6D6'],sand:night?['#DEC89B','#443D2E','#74654B']:['#816944','#F0E6D0','#D9C7A6'],sage:night?['#BDD0BA','#304235','#526B56']:['#4D6A50','#E2EBDD','#BBCBB5'],slate:night?['#BED0D2','#304144','#53696D']:['#50696E','#E2EAEB','#BCCBCF']};
 const [ink,soft,border]=pairs[group];return {ink,soft,border};
};
export const ShopSectionToneContext = createContext<ShopTone | null>(null);
