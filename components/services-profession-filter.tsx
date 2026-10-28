import { TABLET_MODAL_ORIENTATIONS } from '../src/lib/tablet-modal-orientations';
import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useAccessAppearance } from './access-premium';

type Entry = { value: string; label: string; color?: string };

/** Shared web menu: resting, hover and selected states are deliberately distinct. */
export function ServicesSelect({ value, entries, onChange, label, placeholder = 'Seleziona', fullWidth = false }: {
  value: string; entries: Entry[]; onChange: (value: string) => void; label: string; placeholder?: string; fullWidth?: boolean;
}) {
  const { palette: p } = useAccessAppearance();
  const { width, height } = useWindowDimensions();
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const close = () => { setAnchor(null); setHovered(null); };
  const open = () => ref.current?.measureInWindow((x, y, w, h) => { setHovered(null); setAnchor({ x, y, width: w, height: h }); });
  const selectedEntry = entries.find(entry => entry.value === value);
  const selectedFill = p.night ? 'rgba(216,194,155,.22)' : 'rgba(52,55,53,.12)';
  const hoverFill = p.night ? 'rgba(216,194,155,.11)' : 'rgba(52,55,53,.06)';
  const menuWidth = Math.min(width - 24, Math.max(260, anchor?.width ?? 0));
  return <>
    <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: !!anchor }} aria-expanded={!!anchor} onPress={open}
      style={{ ...(fullWidth ? { width: '100%' } : { minWidth: 190, maxWidth: 280 }), minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 24, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: p.night?p.border:'#B9AE9C', backgroundColor: Platform.OS==='web'?(p.night ? '#2B2B29' : '#D9D1C5'):p.field }}>
      <View style={{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:10}}>{selectedEntry?.color?<View style={{width:3,height:22,borderRadius:2,backgroundColor:selectedEntry.color}}/>:null}<Text style={{ color: p.ink, fontSize: 13, flexShrink: 1 }}>{selectedEntry?.label ?? placeholder}</Text></View>
      <Ionicons name="chevron-down" size={15} color={p.muted} />
    </Pressable>
    <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible={!!anchor} transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1 }}>
        <Pressable accessibilityLabel={`Chiudi ${label.toLowerCase()}`} onPress={close} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
        {anchor ? <View {...{dataSet:{ servicesFilterMenu: 'true' }}} accessibilityRole="menu" style={{ position: 'absolute', left: Math.max(12, Math.min(anchor.x, width - menuWidth - 12)), top: Math.max(12, Math.min(anchor.y + anchor.height + 8, height - Math.min(340, entries.length * 48 + 16) - 12)), width: menuWidth, maxHeight: 340, padding: 7, borderRadius: 16, borderWidth: 1, borderColor: p.border, backgroundColor: Platform.OS==='web'?(p.night ? '#292A28' : '#DED7CD'):(p.night?'#242829':'#F7F4EF'), boxShadow: '0 12px 36px rgba(0,0,0,.22)' }}>
          {Platform.OS==='web' && React.createElement('style', null, `[data-services-filter-menu]{color-scheme:${p.night?'dark':'light'};}[data-services-filter-menu] :focus,[data-services-filter-menu] :focus-visible{outline:none!important;box-shadow:none!important;}[data-services-filter-menu],[data-services-filter-menu] *{scrollbar-width:thin;scrollbar-color:${p.night?'#777167 #292A28':'#A79B89 #DED7CD'};}[data-services-filter-menu] *::-webkit-scrollbar{width:8px;background:${p.night?'#292A28':'#DED7CD'};}[data-services-filter-menu] *::-webkit-scrollbar-track,[data-services-filter-menu] *::-webkit-scrollbar-track:hover,[data-services-filter-menu] *::-webkit-scrollbar-track:active{background:${p.night?'#292A28':'#DED7CD'};}[data-services-filter-menu] *::-webkit-scrollbar-thumb{background:${p.night?'#777167':'#A79B89'};border:2px solid ${p.night?'#292A28':'#DED7CD'};border-radius:8px;}`)}
          <ScrollView>{entries.map(entry => {
            const selected = value === entry.value;
            return <Pressable key={entry.value} accessibilityRole="menuitem" accessibilityState={{ selected }} aria-selected={selected} onHoverIn={() => setHovered(entry.value)} onHoverOut={() => setHovered(null)} onPress={() => { onChange(entry.value); close(); }}
              style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 3, backgroundColor: selected ? (hovered === entry.value ? (p.night ? 'rgba(216,194,155,.29)' : 'rgba(52,55,53,.17)') : selectedFill) : hovered === entry.value ? hoverFill : 'transparent' }}>
              <>{entry.color?<View style={{width:3,height:22,borderRadius:2,backgroundColor:entry.color}}/>:null}</><Text style={{ flex: 1, color: p.ink, fontSize: 13 }}>{entry.label}</Text>
              {selected ? <Ionicons name="checkmark" size={16} color={p.ink} /> : null}
            </Pressable>;
          })}</ScrollView>
        </View> : null}
      </View>
    </Modal>
  </>;
}

export function ServicesProfessionFilter({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
  const {palette:p}=useAccessAppearance();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} {...{dataSet:{premiumToolbarFilters:'true'}}} style={{minWidth:0,flexGrow:0}} contentContainerStyle={{gap:7,alignItems:'center'}}>
    {[{value:'',label:'Tutti'},...options.map(role=>({value:role,label:role}))].map(entry=><Pressable key={entry.value} accessibilityRole="button" accessibilityLabel={`Filtra mestiere: ${entry.label}`} accessibilityState={{selected:value===entry.value}} aria-pressed={value===entry.value} onPress={()=>onChange(entry.value)} style={{flexShrink:0,minHeight:40,paddingHorizontal:13,paddingVertical:9,borderRadius:12,borderWidth:1,borderColor:value===entry.value?p.action:p.line,backgroundColor:value===entry.value?p.action:p.field,justifyContent:'center'}}><Text style={{fontSize:13,color:value===entry.value?p.actionText:p.ink}}>{entry.label}</Text></Pressable>)}
  </ScrollView>;
}
