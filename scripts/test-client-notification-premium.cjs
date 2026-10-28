/* Read/unread contrast and notification-specific regressions. No transport or app mutations. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const modules = new Map();
const reactNative = {Platform:{OS:'web'},StyleSheet:{flatten:style=>style}};
function load(file) {
  if (modules.has(file)) return modules.get(file);
  const exports = {};
  modules.set(file, exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText, {
    exports, require(name) {
      if(name==='react-native') return reactNative;
      if(name==='react') return {createContext:value=>value};
      assert.ok(name.startsWith('./'),name);
      return load('components/'+name.slice(2)+'.ts');
    },
  });
  return exports;
}
function rgba(value) {
  if(value[0]==='#') return [parseInt(value.slice(1,3),16),parseInt(value.slice(3,5),16),parseInt(value.slice(5,7),16),1];
  const parts=value.match(/[\d.]+/g).map(Number);return [...parts.slice(0,3),parts[3]??1];
}
function over(color, background) { const c=rgba(color),b=rgba(background);return c.slice(0,3).map((v,i)=>v*c[3]+b[i]*(1-c[3])); }
function light(values) { const c=values.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722; }
function contrast(text, background) { const a=light(rgba(text).slice(0,3)),b=light(background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05); }
const {day,night}=load('components/access-appearance-context.ts');
const {clientNotificationPremiumStyles,clientNotificationTone}=load('components/client-notification-premium.ts');
const {clientBookingPremiumStyles}=load('components/client-booking-premium-styles.ts');
const {CLIENT_NOTIFICATION_RED}=load('components/client-notification-tone.ts');
const {clientNotificationActionColors}=load('components/client-notification-actions.ts');
const {premiumNotificationBannerTone}=load('components/premium-notification-banner.ts');
const {nativeBarStyles}=load('components/owner-premium-native-style.ts');
let checks=0;
for(const p of [day,night]){
  const banner=premiumNotificationBannerTone(p.night);
  assert.match(banner.surface,/^#[\dA-F]{6}$/i,'Live banners are fully opaque');
  assert.ok(contrast(banner.ink,rgba(banner.surface).slice(0,3))>=4.5,'Banner titles remain readable');
  assert.ok(contrast(banner.body,rgba(banner.surface).slice(0,3))>=4.5,'Banner details remain readable');
  assert.ok(contrast(banner.icon,rgba(banner.iconSurface).slice(0,3))>=3,'Banner icon remains visible');
  assert.equal(light(rgba(banner.surface).slice(0,3))>.5,p.night,'The banner uses the inverse appearance');
  for(const OS of ['web','ios','android']){
    reactNative.Platform.OS=OS;
    const customer=clientBookingPremiumStyles({clientForegroundBar:{backgroundColor:'rgba(255,255,255,.04)'},clientForegroundBarTitle:{color:'#fff'},clientForegroundBarBody:{color:'#fff'}},p);
    assert.equal(customer.clientForegroundBar.backgroundColor,banner.surface);
    assert.equal(customer.clientForegroundBarTitle.color,banner.ink);
    assert.equal(customer.clientForegroundBarBody.color,banner.body);
    const owner=nativeBarStyles({liveRequestBanner:{backgroundColor:'rgba(15,23,42,.96)'},liveRequestBannerTitle:{color:'#fff'},liveRequestBannerBody:{color:'#fff'},liveRequestBannerHint:{color:'#fff'}},p);
    assert.equal(owner.liveRequestBanner.backgroundColor,banner.surface);
    assert.equal(owner.liveRequestBannerTitle.color,banner.ink);
    assert.equal(owner.liveRequestBannerBody.color,banner.body);
  }
  reactNative.Platform.OS='web';
  const base={requestStatusCardUnreadActive:{backgroundColor:p.action},requestStatusTitle:{color:p.actionText}};
  const before=JSON.stringify(base),styles=clientNotificationPremiumStyles(base,p);
  assert.equal(JSON.stringify(base),before,'Presentation must not mutate shared base styles');
  for(const key of ['requestStatusCardPending','requestStatusCardAccepted','requestStatusCardRejected','requestStatusCardCancelled','requestStatusCardUnreadActive']){
    assert.notEqual(styles[key].backgroundColor,p.action,'An unread card cannot inherit the button fill');
    assert.notEqual(styles[key].borderColor,CLIENT_NOTIFICATION_RED,'Unread cards are never circled in red');
    // Heavy card text stays readable even over the brightest/darkest possible satin beam.
    const background=over(styles[key].backgroundColor,p.night?'#FFFFFF':'#000000');
    assert.ok(contrast(p.ink,background)>=4.5,key+' primary text');
    assert.ok(contrast(p.muted,background)>=4.5,key+' secondary text');
    checks++;
  }
  assert.equal(styles.calendarButton.backgroundColor,p.action);
  assert.equal(styles.calendarButtonText.color,p.actionText);
  const accordionKeys=['frontendBookingAccordion','frontendBookingAccordionExpanded','frontendBookingAccordionWithNotification'];
  const legacyAccordions=Object.fromEntries(accordionKeys.map(key=>[key,{borderColor:CLIENT_NOTIFICATION_RED}]));
  const combined=clientBookingPremiumStyles({...legacyAccordions,frontendBookingAccordionCornerBadge:{backgroundColor:'#fff'},frontendBookingAccordionCornerBadgeText:{color:'#000'}},p);
  for(const key of accordionKeys) assert.equal(combined[key].borderColor,p.border,'Read, unread and expanded accordions keep neutral theme borders');
  assert.equal(combined.frontendBookingAccordionCornerBadge.backgroundColor,CLIENT_NOTIFICATION_RED);
  assert.equal(combined.frontendBookingAccordionCornerBadgeText.color,'#FFFFFF');
  assert.equal(combined.frontendBookingAccordionNewPill.display,'none','Only the upper counter needs attention red');
  for(const key of ['requestOverviewCardUpcoming','requestOverviewCardPending','requestOverviewCardSalonCancelled','requestOverviewCardArchived']){
    for(const beam of ['#FFFFFF','#000000']){
      const background=over(combined[key].backgroundColor,beam);
      assert.ok(contrast(combined.requestOverviewValue.color,background)>=4.5,key+' count contrast over satin');
      assert.ok(contrast(combined.requestOverviewLabel.color,background)>=4.5,key+' label contrast over satin');
    }
  }
  const colors=['pending','accepted','changed','cancelled','archive'].map(tone=>clientNotificationTone(p,tone).ink);
  assert.equal(new Set(colors).size,colors.length,'Status hierarchy stays distinct in each theme');
  for(const action of ['call','whatsapp','cancel']){
    const c=clientNotificationActionColors(p.night,action);
    for(const fill of [c.fill,c.hover]){
      assert.ok(contrast(c.ink,rgba(fill).slice(0,3))>=4.5,action+' text remains readable at rest and on hover');
      assert.ok(contrast(c.icon,rgba(fill).slice(0,3))>=3,action+' icon remains visible at rest and on hover');
    }
  }
  reactNative.Platform.OS='ios';
  const nativeStyles=clientNotificationPremiumStyles({},p);
  assert.equal(nativeStyles.inlineCallButton.backgroundColor,p.night?p.field:'rgba(96,91,80,.055)','Web action styling must not change native controls');
  reactNative.Platform.OS='web';
}
assert.ok(contrast('#FFFFFF',rgba(CLIENT_NOTIFICATION_RED).slice(0,3))>=4.5);
console.log(`PASS ${checks} notification card/theme cases: readable text, neutral read/unread outlines, status hierarchy and red counters only.`);
