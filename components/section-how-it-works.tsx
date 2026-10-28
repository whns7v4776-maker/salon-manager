import {InfoButton} from './ui/info-button';
import {NativeReadableText as Text,nativeSerif} from './owner-native-premium';
import { useAccessAppearance } from './access-premium';
import { nativeRequestsStyles } from './owner-premium-requests-style';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  LayoutAnimation,
  Platform,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { HapticTouchable } from './ui/haptic-touchable';

export type SectionHowItWorksStep = {
  title: string;
  description: string;
};

type SectionHowItWorksButtonProps = {
  open: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  showCloseWhenOpen?: boolean;
  compact?: boolean;
  iconColor?: string;
  bareInfo?: boolean;
  roundInfoBadge?: boolean;
};

type SectionHowItWorksPanelProps = {
  premiumNative?:boolean;
  onClose: () => void;
  title: string;
  description: string;
  steps: SectionHowItWorksStep[];
  note?: string;
  style?: StyleProp<ViewStyle>;
};

export function SectionHowItWorksButton({open,onPress,style,accessibilityLabel='Apri la guida della sezione'}:SectionHowItWorksButtonProps){
 const handlePress=React.useCallback(()=>{
  if (Platform.OS !== 'web') {
   LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }
  onPress();
 },[onPress]);
 return <InfoButton style={style} accessibilityLabel={accessibilityLabel} accessibilityState={{expanded:open}} onPress={handlePress}/>;
}

export function SectionHowItWorksPanel({
  premiumNative=false,
  onClose,
  title,
  description,
  steps,
  note,
  style,
}: SectionHowItWorksPanelProps) {
  const {palette:p}=useAccessAppearance();
  const styles=React.useMemo(()=>{
    const base=premiumNative?nativeRequestsStyles(baseGuideStyles,p):baseGuideStyles;
    const sage=p.night?'rgba(128,164,140,.16)':'rgba(221,234,223,.7)';
    return {...base,
      panel:{...base.panel,backgroundColor:p.surface,borderColor:p.border,borderRadius:22,padding:18,gap:16,shadowOpacity:0,elevation:0,...(Platform.OS==='web'?{boxShadow:'0 10px 30px rgba(35,30,22,.06)',backdropFilter:'blur(16px)'}:{})},
      headingRow:{...base.headingRow,gap:12},
      headingIcon:{...base.headingIcon,width:38,height:38,borderRadius:12,backgroundColor:sage},
      title:{...base.title,fontFamily:nativeSerif,fontSize:24,lineHeight:30,fontWeight:'400' as const,color:p.ink},
      description:{...base.description,marginTop:6,fontSize:13,lineHeight:20,fontWeight:'400' as const,color:p.muted},
      step:{...base.step,padding:14,borderRadius:15,borderColor:p.line,backgroundColor:p.field,gap:11},
      stepIndex:{...base.stepIndex,backgroundColor:sage,color:p.night?'#BCD8C5':'#486A53',fontWeight:'600' as const,borderRadius:13},
      stepTitle:{...base.stepTitle,fontSize:14,lineHeight:20,fontWeight:'600' as const,color:p.ink},
      stepDescription:{...base.stepDescription,marginTop:5,fontSize:13,lineHeight:20,fontWeight:'400' as const,color:p.muted},
      note:{...base.note,backgroundColor:sage,padding:13,borderRadius:13},
      noteText:{...base.noteText,fontSize:12,lineHeight:18,fontWeight:'400' as const,color:p.ink},
    };
  },[premiumNative,p]);
  return (
    <Animated.View
      {...(Platform.OS==='web'?{dataSet:{sectionHelp:'true'}}:{})}
      entering={FadeIn.duration(180).easing(Easing.out(Easing.cubic))}
      exiting={FadeOut.duration(120).easing(Easing.out(Easing.cubic))}
      layout={LinearTransition.duration(190).easing(Easing.out(Easing.cubic))}
      style={[styles.panel, style,Platform.OS==='web'&&({containerType:'inline-size',containerName:'section-help',minWidth:0} as any)]}
    >
      {Platform.OS==='web'?React.createElement('style',null,`
      @container section-help (max-width:240px){
       [data-help-heading]{flex-direction:column!important;}
       [data-help-heading-copy]{width:100%!important;flex:auto!important;}
       [data-help-step]{flex-direction:column!important;gap:9px!important;background:transparent!important;border:0!important;border-bottom:1px solid ${p.line}!important;border-radius:0!important;padding:12px 0!important;}
       [data-help-step-copy]{width:100%!important;flex:auto!important;}
      }
      `):null}
      <View {...(Platform.OS==='web'?{dataSet:{helpHeading:'true'}}:{})} style={styles.headingRow}>
        <View style={styles.headingIcon}>
          <Ionicons name="bulb-outline" size={19} color={p.ink} />
        </View>
        <View {...(Platform.OS==='web'?{dataSet:{helpHeadingCopy:'true'}}:{})} style={styles.headingCopy}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
        </View>
        {Platform.OS==='web'?<HapticTouchable accessibilityRole="button" accessibilityLabel="Chiudi informazioni" onPress={onClose} style={{width:36,height:36,borderRadius:11,borderWidth:1,borderColor:p.border,backgroundColor:p.field,alignItems:'center',justifyContent:'center'}}><Ionicons name="close" size={19} color={p.ink}/></HapticTouchable>:null}
      </View>

      <View style={[styles.steps,Platform.OS==='web'&&({display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,280px),1fr))',width:'100%'} as any)]}>
        {steps.map((step, index) => (
          <View key={`${index}-${step.title}`} {...(Platform.OS==='web'?{dataSet:{helpStep:'true'}}:{})} style={[styles.step,Platform.OS==='web'&&{maxWidth:'100%',flexBasis:'auto',flexShrink:1}] }>
            <Text style={styles.stepIndex}>{index + 1}</Text>
            <View {...(Platform.OS==='web'?{dataSet:{helpStepCopy:'true'}}:{})} style={styles.stepCopy}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepDescription}>{step.description}</Text>
            </View>
          </View>
        ))}
      </View>

      {note ? (
        <View style={styles.note}>
          <Ionicons name="sync-outline" size={16} color={p.muted} />
          <Text style={styles.noteText}>{note}</Text>
        </View>
      ) : null}
      {Platform.OS !== 'web' ? (
        <HapticTouchable immediatePress onPress={onClose} accessibilityRole="button" accessibilityLabel="Chiudi informazioni" style={{minHeight:44,marginTop:10,paddingTop:9,alignItems:'center',justifyContent:'center',gap:5,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:p.line}}>
          <View style={{width:38,height:3,borderRadius:2,backgroundColor:p.muted,opacity:0.65}} />
          <Text style={{fontSize:11,lineHeight:16,color:p.muted,fontWeight:'500'}}>Chiudi informazioni</Text>
        </HapticTouchable>
      ) : null}
    </Animated.View>
  );
}

const baseGuideStyles = StyleSheet.create({
  button: {
    minHeight: Platform.OS === 'web' ? 36 : 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Platform.OS === 'web' ? 6 : 4,
    paddingHorizontal: Platform.OS === 'web' ? 12 : 9,
    borderRadius: Platform.OS === 'web' ? 18 : 15,
    borderWidth: 1,
    borderColor: Platform.OS === 'web' ? '#BFDBFE' : 'rgba(96, 165, 250, 0.34)',
    backgroundColor: Platform.OS === 'web' ? '#EFF6FF' : 'rgba(239, 246, 255, 0.84)',
    flexShrink: 0,
    ...Platform.select({
      web: {},
      default: {
        shadowColor: '#2563EB',
        shadowOpacity: 0.07,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 1,
      },
    }),
  },
  buttonOpen: {
    borderColor: '#60A5FA',
    backgroundColor: '#DBEAFE',
  },
  buttonCompact: {
    width: 34,
    height: 34,
    minHeight: 34,
    paddingHorizontal: 0,
    borderRadius: 17,
  },
  buttonText: {
    fontSize: Platform.OS === 'web' ? 12 : 10.5,
    lineHeight: Platform.OS === 'web' ? 16 : 14,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  panel: {
    width: '100%',
    marginTop: 10,
    marginBottom: 12,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#F8FBFF',
    gap: 13,
    ...Platform.select({
      web: { boxShadow: '0 12px 28px rgba(37, 99, 235, 0.08)' },
      default: {
        shadowColor: '#2563EB',
        shadowOpacity: 0.08,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 2,
      },
    }),
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  headingIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headingCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '900',
    color: '#0F172A',
  },
  description: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    color: '#64748B',
  },
  steps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: 10,
  },
  step: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    padding: 11,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.12)',
    backgroundColor: 'rgba(255, 255, 255, 0.86)',
  },
  stepIndex: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: '#0F172A',
    color: '#FFFFFF',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 11,
    lineHeight: 26,
    fontWeight: '900',
    flexShrink: 0,
  },
  stepCopy: {
    flex: 1,
    minWidth: 0,
  },
  stepTitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '900',
    color: '#0F172A',
  },
  stepDescription: {
    marginTop: 2,
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: '600',
    color: '#64748B',
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
  },
  noteText: {
    flex: 1,
    minWidth: 0,
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: '700',
    color: '#1E3A8A',
  },
});

