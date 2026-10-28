const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const screenPath = path.join(root, 'app', 'cliente-screen.tsx');
const portalPath = path.join(root, 'src', 'lib', 'client-portal.ts');
const screen = fs.readFileSync(screenPath, 'utf8');
const portal = fs.readFileSync(portalPath, 'utf8');

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const badgeStart = screen.indexOf('const getCustomerRequestNotificationBadge =');
const badgeEnd = screen.indexOf('const respondToBookingOperatorChange =', badgeStart);
assert(badgeStart >= 0 && badgeEnd > badgeStart, 'Customer notification badge classifier not found.');
const badgeClassifier = screen.slice(badgeStart, badgeEnd);

assert(
  /merged\.includes\('appointment_rescheduled_by_salon'\)[\s\S]*?merged\.includes\('rescheduled:'\)/.test(
    screen
  ),
  'Salon reschedule classifier must understand both canonical move markers.'
);
assert(
  /notificationType:[\s\S]*?notification_type[\s\S]*?eventType:[\s\S]*?event_type[\s\S]*?statusCode:[\s\S]*?status_code/.test(
    portal
  ),
  'Portal normalization must preserve event metadata used by the customer badge.'
);

const movedBranch = badgeClassifier.indexOf('if (movedBySalon)');
const operatorBranch = badgeClassifier.indexOf('if (operatorUpdatedBySalon)');
const acceptedFallback = badgeClassifier.indexOf("if (item.stato === 'Accettata')");
assert(movedBranch >= 0, 'Moved appointment badge branch not found.');
assert(operatorBranch > movedBranch, 'A logical start move must win over an operator-only update.');
assert(acceptedFallback > operatorBranch, 'Move/update classification must happen before the accepted fallback.');
assert(
  /label: 'Appuntamento spostato'/.test(badgeClassifier),
  'Moved appointments must use the exact customer-facing badge label.'
);
assert(
  !/Nuovo appuntamento/.test(badgeClassifier),
  'The accepted fallback must not reuse the repetitive Nuovo appuntamento badge.'
);
assert(
  /!notificationBadge \? \([\s\S]*?renderRequestStateBadge\(visualItem\.stato\)/.test(screen),
  'An unread semantic badge must replace, not duplicate, the generic state pill.'
);
assert(
  /isCancelled &&[\s\S]*?!notificationBadge &&[\s\S]*?requestCancellationSourceBadge/.test(screen),
  'Cancellation source must not render as a second redundant badge.'
);
assert(
  /requestInlineNotificationBadgeIcon:[\s\S]*?requestInlineNotificationBadgeIconChanged:/.test(screen),
  'Premium notification badge icon treatment is missing.'
);

console.log('Client rescheduled badge contracts: OK');
