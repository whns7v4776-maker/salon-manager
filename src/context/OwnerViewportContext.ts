import {createContext,useContext} from 'react';
export type OwnerViewport={width:number;sidebar:boolean;railWidth:number};
export const OwnerViewportContext=createContext<OwnerViewport|null>(null);
export const useOwnerViewport=()=>useContext(OwnerViewportContext);
