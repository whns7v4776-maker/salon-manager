# Customer card bottom sheets

Local-only layout update. No build, OTA, web deployment, server or payment changes.

Customer edit, notes, service duration/prices, online policy, booking limits,
confirmations and the desktop management menu use CustomerSheetFrame. Customer
communications also use this frame (the component is only called by Clienti).
Number/date pickers opt into bottom placement from Clienti; other callers retain
existing placement. Swipe handlers, native tab engines and save callbacks are unchanged.

The frame uses KeyboardAvoidingView on iOS/Android, safe-area padding, and the
browser visual viewport on web. Editor height no longer subtracts keyboard height
in addition to keyboard avoidance. Forms remain scrollable; editor and online
policy keyboard scrolling is enabled only while their own panel is open.

Validation: TypeScript noEmit, client identity guard and native client expansion
latency contracts passed. Safari localhost authenticated customer notes and editor
were opened, bottom placement checked visually, and notes focused without saving.
Real iOS/Android keyboard and small landscape screens still require device QA.

Suggested separate follow-up (not implemented): consolidate online services and
acceptance rules with booking limits under Regole di prenotazione. User asked for
an opinion; existing service location is unchanged.

## Follow-up implemented: unified booking rules and fixed info button

The former booking-limits swipe/web action now opens Regole di prenotazione.
One bottom sheet contains Limiti and Servizi e approvazione tabs. Existing limit
persistence (immediate) and online-policy persistence (explicit save) are retained
and labelled separately. Numeric limit pickers return to the same rules sheet
on cancel/confirm. The former expanded-card online-policy launcher is removed.
Per-customer payment policy remains a separate expanded-card section.

The info button now anchors to the card top-right on native and web, with name
space reserved; no card height, swipe layout or gesture-engine changes.

Validated: TypeScript, identity guard and native expansion contracts passed.
Authenticated Safari localhost: management menu -> rules -> both tabs -> monthly
picker -> cancel -> same rules sheet -> close, without saving customer data.
Card info alignment visually checked for all four visible customer cards.
Native physical-device verification and publication remain separate.


## Final visual pass and separate payment action

Edit, delete, inhibit, timing/pricing and booking rules now use a compact visual
family with lighter type, restrained surfaces and clear action hierarchy.
The bottom inset is inside the panel: native sheets span the width and have square
lower corners, avoiding the previous floating-card gap. Timing and numeric-picker
style ordering was corrected so later styles cannot restore lower rounding.
The shared dock style is memoized. Gesture engines and tab navigation are unchanged.

Payment is a separate sixth customer swipe action and web menu action, opening
BookingPaymentPolicyEditor in standalone mode. It uses the same keyboard-aware
bottom frame. Web delete/inhibit now await the custom confirmation panel instead
of window.confirm; the existing data mutations still require confirmation.

Verified: TypeScript, client identity and expansion latency guards, payment ledger
suite and Edge Deno check. Safari localhost: compact booking rules visually
checked, timing panel opened, payment remote load/save checked without changing
its inherited policy, inhibit confirmation opened and cancelled without mutation.
Physical iOS/Android keyboard QA and frontend publication remain outstanding.


## Native swipe palette and action order

Native-only palette: blue Edit, teal Timing/pricing, violet Booking rules,
green Payment, orange Inhibit, red Delete. Background alpha 0.12, fine matching
borders and dark colored labels/icons preserve contrast. Inhibit and Delete occupy
the last row. The six slots retain their prior dimensions, action callbacks and
swipe engine. Web management appearance/order is unchanged by this palette pass.

Customer popup isolation check updated only its section boundary after the former
limit opener was replaced; assertions remain unchanged and pass. Broad legacy
stable-owner-ui and native-tab-jump scripts still fail at their density-gesture
and literal lazy:false expectations respectively. Neither Agenda nor tab layout
was changed in this intervention; these broad suites are not reported as passing.
