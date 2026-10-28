const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app/cliente-screen.tsx', 'utf8');
const start = source.indexOf('  const bookingPages = [');
const end = source.indexOf('  const bookingPageHidden', start);
assert.ok(start > 0 && end > start);
const navigate = overrides => vm.runInNewContext(`${source.slice(start, end)}; ({ pages: bookingPages, index: visibleBookingPage, key: visibleBookingPageKey, limit: firstIncompleteBookingPage });`, {
  servizio: '', dependencyChoiceSatisfied: true, hasConfirmedBookingDay: false,
  canChooseOperator: false, serviceUsesOperatorScheduling: false,
  operatorChoiceSatisfied: true, ora: '', canWriteNote: false,
  bookingPage: 0, currentBookingPaymentHold: null, ...overrides,
});
assert.equal(navigate().key, 'service');
// A valid selection unlocks Next without advancing the current page.
assert.equal(navigate({ servizio: 'Piega' }).key, 'service');
assert.equal(navigate({ servizio: 'Piega', bookingPage: 1 }).key, 'day');
// A required service pairing blocks access to every later page.
assert.equal(navigate({ servizio: 'Colore', dependencyChoiceSatisfied: false, bookingPage: 4 }).key, 'service');
const day = { servizio: 'Piega', hasConfirmedBookingDay: true, canChooseOperator: true };
assert.equal(navigate({ ...day, bookingPage: 2 }).key, 'time');
assert.equal(navigate({ ...day, serviceUsesOperatorScheduling: true, operatorChoiceSatisfied: false, bookingPage: 4 }).key, 'operator');
assert.equal(navigate({ ...day, serviceUsesOperatorScheduling: true, operatorChoiceSatisfied: true, bookingPage: 3 }).key, 'time');
const ready = { ...day, ora: '10:00', canWriteNote: true };
assert.equal(navigate({ ...ready, bookingPage: 3 }).key, 'review');
assert.equal(navigate({ ...ready, bookingPage: 1 }).key, 'day');
assert.equal(navigate({ ...ready, bookingPage: 0 }).key, 'service');
// Losing availability returns to the first unfinished page, keeping submit hidden.
assert.equal(navigate({ ...ready, canChooseOperator: false, canWriteNote: false, bookingPage: 3 }).key, 'day');
assert.equal(navigate({ ...ready, ora: '', canWriteNote: false, bookingPage: 3 }).key, 'time');
assert.equal(navigate({ bookingPage: 0, currentBookingPaymentHold: {} }).key, 'review');
for (const name of ['scheduleNativeBookingDayStepAutoScroll', 'scheduleNativeBookingOperatorStepAutoScroll', 'scheduleNativeBookingTimeStepAutoScroll', 'scheduleWebBookingTimeStepTopScroll']) {
  assert.ok(source.includes(`const ${name} = useCallback(() => {\n    if (MANUAL_BOOKING_STEPS) return;`), name);
}
console.log('PASS: manual booking navigation, prerequisites, optional operators, back, invalidation, payment recovery and no step autoscroll');
const recommendedStart = source.indexOf('  const presentedRecommendedTimeSlots =');
const recommendedEnd = source.indexOf('  const hasGuidedRecommendations =', recommendedStart);
const allRecommended = ['09:00', '09:15', '09:30', '10:00', '10:30', '12:00', '12:15', '12:30', '14:00'];
const present = (showMoreRecommendedTimes, ora = '') => Array.from(vm.runInNewContext(`${source.slice(recommendedStart, recommendedEnd)}; presentedRecommendedTimeSlots;`, {
  useMemo: fn => fn(), visibleGuidedRecommendedTimeSlots: allRecommended, showMoreRecommendedTimes, ora,
}));
assert.deepEqual(present(false), ['09:00', '09:15', '09:30', '12:00', '12:15', '12:30']);
assert.deepEqual(present(true), allRecommended);
assert.ok(present(false, '14:00').includes('14:00'));
console.log('PASS: compact recommendations retain morning, afternoon, selected times and full expansion');

const journey = fs.readFileSync('components/client-booking-journey.tsx', 'utf8');
const tsPresentation = require('typescript');
const presentation = {exports:{}};
vm.runInNewContext(tsPresentation.transpileModule(fs.readFileSync('components/client-booking-presentation.ts','utf8'), {compilerOptions:{target:tsPresentation.ScriptTarget.ES2022,module:tsPresentation.ModuleKind.CommonJS}}).outputText,{exports:presentation.exports,Date,Map});
const {bookingAvailableDates,bookingCalendarCells,bookingMonthShift,bookingNativeDateLayout,bookingTimePeriods}=presentation.exports;
assert.equal(bookingNativeDateLayout(353,1).columns,3,'A normal iPhone shows three native date columns');
assert.equal(bookingNativeDateLayout(390,1).columns,4,'A wider iPhone fits four native date columns');
assert.equal(bookingNativeDateLayout(353,1).batchSize,9,'Native dates start with nine suggestions instead of six');
assert.equal(bookingNativeDateLayout(390,1).batchSize,12,'Four columns start with twelve suggestions');
for(const contentWidth of [280,335,353,390,704]) for(const scale of [1,1.25,1.6,2]){
 const grid=bookingNativeDateLayout(contentWidth,scale);
 assert.ok(grid.columns>=1&&grid.columns<=4);
 assert.ok(Math.abs(grid.cardWidth*grid.columns+grid.gap*(grid.columns-1)-contentWidth)<.001,'Date columns fit the safe content width exactly');
 assert.equal(grid.batchSize,grid.columns*3);
}
assert.ok(bookingNativeDateLayout(353,1.6).columns<3,'Enlarged accessibility text gets more room per date');
assert.equal(bookingAvailableDates([{disabled:false,pending:false,status:"Disponibile"},{disabled:false,pending:false,status:"Completo"},{disabled:true,pending:false,status:"Disponibile"},{disabled:false,pending:true,status:"Disponibile"}]).length,1,"Only authoritative free dates may be suggested before the optional calendar");
const dates=[{value:'2026-11-10',disabled:false,status:'Disponibile'},{value:'2026-11-15',disabled:true,status:'Chiuso'},{value:'2026-12-03',disabled:false,status:'Completo'}];
const november=bookingCalendarCells(dates,'2026-11');
assert.equal(november.length,42,'November starts on Sunday and requires six Monday-first weeks');
assert.equal(november[6].number,1);
assert.equal(november[15].day,dates[0],'The selected date keeps the original availability object');
assert.equal(november[20].day.disabled,true,'Closure is never promoted to a selectable date');
assert.equal(november[7].day,undefined,'Dates not supplied by the authority stay unavailable');
assert.equal(bookingCalendarCells(dates,'2026-12').find(cell=>cell?.value==='2026-12-03').day.status,'Completo');
assert.equal(bookingMonthShift('2026-12',1),'2027-01');
assert.equal(bookingMonthShift('2027-01',-1),'2026-12');
assert.equal(bookingCalendarCells([],'2028-02').filter(Boolean).length,29,'Leap years remain correct');
const periods=bookingTimePeriods([{value:'10:00',disabled:false},{value:'18:30',disabled:false}], [{value:'10:00',disabled:true,hint:'Non più disponibile'},{value:'14:00',disabled:false}]);
assert.equal(periods[0].items.length,1,'Repeated times do not create competing choices');
assert.equal(periods[0].items[0].disabled,true,'A duplicate never weakens an availability block');
assert.equal(periods[0].items[0].hint,'Non più disponibile');
assert.equal(periods[2].items[0].value,'18:30','Later selections remain present in their time period');
console.log('PASS: monthly calendar boundaries, closures, unknown dates, leap years and authoritative time grouping');

// Exercise the production day presentation, including fully booked days that still support waitlist alerts.
const ts = require('typescript');
const ast = ts.createSourceFile('cliente-screen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let dayExpression;
function findJourney(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'journeyProps' && ts.isObjectLiteralExpression(node.initializer)) {
    dayExpression = node.initializer.properties.find(property => property.name?.getText(ast) === 'days')?.initializer.getText(ast);
  }
  ts.forEachChild(node, findJourney);
}
findJourney(ast);
assert.ok(dayExpression);
const presentDay = overrides => vm.runInNewContext(ts.transpileModule(`(${dayExpression})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
  giorniDisponibili: [{ value: '2030-10-14', weekdayShort: 'lun', dayNumber: 14, monthShort: 'ott', fullLabel: 'Lunedì 14 ottobre' }],
  today: '2030-10-14', effectiveAvailabilitySettings: {}, canChooseDay: true,
  getDateAvailabilityInfo: () => ({ closed: false }), isFrontendDayFullForService: () => true,
  isLivePublicDaySummaryDateCurrent: () => true, isDateWithinPublicBookingWindow: () => true, ...overrides,
})[0];
assert.equal(presentDay({}).status, 'Completo');
assert.equal(presentDay({}).disabled, false, 'Fully booked days remain inspectable for availability alerts');
assert.equal(presentDay({ getDateAvailabilityInfo: () => ({ closed: true }) }).disabled, true);
assert.equal(presentDay({ isFrontendDayFullForService: () => null }).disabled, true);
assert.equal(presentDay({ isDateWithinPublicBookingWindow: () => false }).disabled, true);
console.log('PASS: returning to later dates/times preserves selection; full days allow alerts while closed, pending and out-of-window days stay disabled');
