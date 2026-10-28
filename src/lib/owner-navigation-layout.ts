export type OwnerNavigationPreference='auto'|'bottom'|'sidebar';
export const NATIVE_OWNER_RAIL_WIDTH=224;
export const OWNER_AUTO_SIDEBAR_MIN_WIDTH=1200;
export const OWNER_MANUAL_SIDEBAR_MIN_WIDTH=1100;

/** Available window space, including split view, decides whether a rail can fit. */
export function resolveOwnerNavigationLayout({width,height,preference,fontScale=1,insetLeft=0,insetRight=0}:{
  width:number;height:number;preference:OwnerNavigationPreference;fontScale?:number;insetLeft?:number;insetRight?:number;
}) {
  const available=Math.max(0,width-insetLeft-insetRight);
  const extraTextSpace=Math.max(0,fontScale-1)*180;
  const minimum=(preference==='sidebar'?OWNER_MANUAL_SIDEBAR_MIN_WIDTH:OWNER_AUTO_SIDEBAR_MIN_WIDTH)+extraTextSpace;
  const orientationFits=preference==='sidebar'||width>height;
  const sidebar=preference!=='bottom'&&orientationFits&&available>=minimum&&height>=600;
  const railWidth=sidebar?NATIVE_OWNER_RAIL_WIDTH+insetLeft:0;
  return {sidebar,railWidth,contentWidth:Math.max(0,width-railWidth),minimumWidth:minimum};
}
