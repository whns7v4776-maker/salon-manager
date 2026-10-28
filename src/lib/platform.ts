export type SubscriptionPlan = 'demo' | 'starter' | 'pro';
export type SubscriptionStatus = 'demo' | 'active' | 'suspended' | 'expired';
export type SalonNameDisplayStyle = 'corsivo' | 'stampatello' | 'minuscolo';
export type SalonNameFontVariant =
  | 'neon'
  | 'condensed'
  | 'minimal'
  | 'poster'
  | 'future'
  | 'editorial'
  | 'classic'
  | 'luxury'
  | 'script'
  | 'vogue'
  | 'atelier'
  | 'manrope' | 'montserrat' | 'cinzel' | 'cormorant'
  | 'parisienne' | 'italiana' | 'righteous' | 'audiowide';

export const salonNameFontVariants: readonly SalonNameFontVariant[] = [
  'neon', 'condensed', 'minimal', 'poster', 'future', 'editorial',
  'classic', 'luxury', 'script', 'vogue', 'atelier',
  'manrope', 'montserrat', 'cinzel', 'cormorant',
  'parisienne', 'italiana', 'righteous', 'audiowide',
];

export type SalonWorkspace = {
  id: string;
  ownerEmail: string;
  salonCode: string;
  salonName: string;
  salonNameDisplayStyle: SalonNameDisplayStyle;
  salonNameFontVariant: SalonNameFontVariant;
  salonBrandingUpdatedAt?: string;
  businessPhone: string;
  additionalPhones?: string[];
  activityCategory: string;
  salonAddress: string;
  streetType: string;
  streetName: string;
  streetNumber: string;
  city: string;
  postalCode: string;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  isInternalTester: boolean;
  createdAt: string;
  updatedAt: string;
  cashSectionDisabled?: boolean;
  autoAcceptBookingRequests?: boolean;
  autoAcceptBookingRequestsUpdatedAt?: string;
  customerReminderHoursBefore?: number;
  clientWelcomeEnabled?: boolean;
  clientWelcomeTitle?: string;
  clientWelcomeMessage?: string;
  trialEndsAt?: string;
  subscriptionEndsAt?: string;
  lastBackupAt?: string;
};

const normalizeReminderHours = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(168, Math.round(value)));
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(168, Math.round(parsed)));
    }
  }

  return 24;
};

export const normalizeWorkspaceEmail = (value: string) => value.trim().toLowerCase();

const slugifyValue = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

export const buildSalonCode = (salonName: string, email: string) => {
  const emailBase = normalizeWorkspaceEmail(email).split('@')[0] || 'salone';
  const nameBase =
    salonName.trim()
      ? slugifyValue(salonName)
      : slugifyValue(emailBase);
  const emailSuffix = normalizeWorkspaceEmail(email).replace(/[^a-z0-9]/g, '').slice(-4) || '0000';

  return `${nameBase || 'salone'}-${emailSuffix}`.slice(0, 36);
};

export const normalizeSalonCode = (value: string) => slugifyValue(value).slice(0, 36);

export const resolveSalonDisplayName = ({
  salonName,
  activityCategory,
  salonCode,
  ownerEmail,
}: {
  salonName?: string | null;
  activityCategory?: string | null;
  salonCode?: string | null;
  ownerEmail?: string | null;
}) => {
  const explicitName = salonName?.trim();
  if (explicitName) {
    return explicitName;
  }

  const businessLabel = activityCategory?.trim();
  if (businessLabel) {
    return businessLabel;
  }

  const codeBase = normalizeSalonCode(salonCode ?? '')
    .split('-')
    .filter(Boolean)
    .slice(0, -1)
    .join(' ');
  if (codeBase) {
    return codeBase.replace(/\b\w/g, (char) => char.toUpperCase());
  }

  return 'Salone';
};

export const formatSalonAddress = (workspace: Pick<
  SalonWorkspace,
  'streetType' | 'streetName' | 'streetNumber' | 'city' | 'postalCode' | 'salonAddress'
>) => {
  const street = [workspace.streetType, workspace.streetName, workspace.streetNumber]
    .map((item) => item.trim())
    .filter(Boolean)
    .join(' ');
  const cityLine = [workspace.postalCode.trim(), workspace.city.trim()].filter(Boolean).join(' ');
  const formatted = [street, cityLine].filter(Boolean).join(', ');

  return formatted || workspace.salonAddress.trim();
};

export const parseSalonAddress = (value: string) => {
  const raw = value.trim();

  if (!raw) {
    return {
      streetLine: '',
      postalCode: '',
      city: '',
    };
  }

  const segments = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const streetLine = segments[0] ?? raw;
  const locationSegment = segments[segments.length - 1] ?? '';
  const locationMatch = locationSegment.match(/^(\d{4,6})\s+(.+)$/);

  if (locationMatch) {
    return {
      streetLine,
      postalCode: locationMatch[1]?.trim() ?? '',
      city: locationMatch[2]?.trim() ?? '',
    };
  }

  return {
    streetLine,
    postalCode: '',
    city: segments.length > 1 ? locationSegment : '',
  };
};

export const createDefaultWorkspace = (email: string): SalonWorkspace => {
  const normalizedEmail = normalizeWorkspaceEmail(email);
  const now = new Date().toISOString();

  return {
    id: normalizedEmail ? `workspace-${normalizedEmail.replace(/[^a-z0-9]/g, '-')}` : 'workspace-unconfigured',
    ownerEmail: normalizedEmail,
    salonCode: normalizedEmail ? buildSalonCode('', normalizedEmail) : '',
    salonName: '',
    salonNameDisplayStyle: 'corsivo',
    salonNameFontVariant: 'neon',
    businessPhone: '',
    activityCategory: '',
    salonAddress: '',
    streetType: '',
    streetName: '',
    streetNumber: '',
    city: '',
    postalCode: '',
    subscriptionPlan: 'demo',
    subscriptionStatus: 'demo',
    isInternalTester: false,
    createdAt: now,
    updatedAt: now,
    cashSectionDisabled: false,
    autoAcceptBookingRequests: false,
    autoAcceptBookingRequestsUpdatedAt: undefined,
    customerReminderHoursBefore: 24,
    clientWelcomeEnabled: true,
    clientWelcomeTitle: 'Benvenuto da {salone}!',
    clientWelcomeMessage:
      'Ciao {nome}, siamo felici di averti con noi. Da qui puoi consultare i servizi e prenotare i tuoi appuntamenti.',
    trialEndsAt: undefined,
    subscriptionEndsAt: undefined,
    lastBackupAt: undefined,
  };
};

export const normalizeWorkspace = (
  workspace: Partial<SalonWorkspace> | null | undefined,
  email: string
): SalonWorkspace => {
  const fallback = createDefaultWorkspace(email);

  return {
    ...fallback,
    ...workspace,
    additionalPhones: Array.isArray(workspace?.additionalPhones) ? workspace.additionalPhones.filter((value): value is string => typeof value === 'string').map((value) => value.trim()) : [],
    ownerEmail: normalizeWorkspaceEmail(workspace?.ownerEmail ?? email),
    salonCode: normalizeSalonCode(
      workspace?.salonCode ?? buildSalonCode(workspace?.salonName ?? fallback.salonName, email)
    ),
    salonNameDisplayStyle:
      workspace?.salonNameDisplayStyle === 'stampatello'
        ? 'stampatello'
        : workspace?.salonNameDisplayStyle === 'minuscolo'
          ? 'minuscolo'
          : 'corsivo',
    salonNameFontVariant: workspace?.salonNameFontVariant &&
      salonNameFontVariants.includes(workspace.salonNameFontVariant)
        ? workspace.salonNameFontVariant : 'neon',
    activityCategory: workspace?.activityCategory?.trim() ?? fallback.activityCategory,
    cashSectionDisabled: workspace?.cashSectionDisabled ?? fallback.cashSectionDisabled,
    autoAcceptBookingRequests:
      workspace?.autoAcceptBookingRequests ?? fallback.autoAcceptBookingRequests,
    autoAcceptBookingRequestsUpdatedAt:
      typeof workspace?.autoAcceptBookingRequestsUpdatedAt === 'string' &&
      workspace.autoAcceptBookingRequestsUpdatedAt.trim()
        ? workspace.autoAcceptBookingRequestsUpdatedAt.trim()
        : undefined,
    customerReminderHoursBefore: normalizeReminderHours(workspace?.customerReminderHoursBefore),
    clientWelcomeEnabled: workspace?.clientWelcomeEnabled !== false,
    clientWelcomeTitle:
      workspace?.clientWelcomeTitle?.trim() || fallback.clientWelcomeTitle,
    clientWelcomeMessage:
      workspace?.clientWelcomeMessage?.trim() || fallback.clientWelcomeMessage,
    salonAddress: formatSalonAddress({
      streetType: workspace?.streetType ?? fallback.streetType,
      streetName: workspace?.streetName ?? fallback.streetName,
      streetNumber: workspace?.streetNumber ?? fallback.streetNumber,
      city: workspace?.city ?? fallback.city,
      postalCode: workspace?.postalCode ?? fallback.postalCode,
      salonAddress: workspace?.salonAddress ?? fallback.salonAddress,
    }),
    updatedAt: workspace?.updatedAt ?? fallback.updatedAt,
  };
};

const parseSubscriptionDateMs = (value?: string | null) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;

  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export type WorkspaceAccessReason =
  | 'internal_tester'
  | 'active_subscription'
  | 'subscription_required'
  | 'missing_expiration'
  | 'expired'
  | 'inactive';

export type WorkspaceAccessDecision = {
  allowed: boolean;
  reason: WorkspaceAccessReason;
  endsAtMs: number | null;
};

export const hasWorkspaceSubscriptionExpired = (
  workspace: Pick<SalonWorkspace, 'subscriptionStatus' | 'subscriptionEndsAt'>,
  nowMs = Date.now()
) => {
  if (workspace.subscriptionStatus !== 'active') {
    return false;
  }

  const endsAtMs = parseSubscriptionDateMs(workspace.subscriptionEndsAt);
  return endsAtMs !== null && endsAtMs <= nowMs;
};

export const getWorkspaceAccessDecision = (
  workspace: SalonWorkspace,
  nowMs = Date.now()
): WorkspaceAccessDecision => {
  if (workspace.isInternalTester) {
    return {
      allowed: true,
      reason: 'internal_tester',
      endsAtMs: parseSubscriptionDateMs(workspace.subscriptionEndsAt),
    };
  }

  if (workspace.subscriptionStatus === 'demo') {
    return {
      allowed: false,
      reason: 'subscription_required',
      endsAtMs: parseSubscriptionDateMs(workspace.subscriptionEndsAt),
    };
  }

  if (workspace.subscriptionStatus !== 'active') {
    return {
      allowed: false,
      reason: workspace.subscriptionStatus === 'expired' ? 'expired' : 'inactive',
      endsAtMs: parseSubscriptionDateMs(workspace.subscriptionEndsAt),
    };
  }

  const endsAtMs = parseSubscriptionDateMs(workspace.subscriptionEndsAt);
  if (endsAtMs === null) {
    return {
      allowed: false,
      reason: 'missing_expiration',
      endsAtMs: null,
    };
  }

  if (endsAtMs <= nowMs) {
    return {
      allowed: false,
      reason: 'expired',
      endsAtMs,
    };
  }

  return {
    allowed: true,
    reason: 'active_subscription',
    endsAtMs,
  };
};

export const isWorkspaceAccessible = (workspace: SalonWorkspace, nowMs = Date.now()) =>
  getWorkspaceAccessDecision(workspace, nowMs).allowed;
