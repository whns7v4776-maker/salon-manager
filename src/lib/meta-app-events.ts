// Web deliberately has no Meta SDK, cookies, pixel or advertising consent prompt.
export const isMetaMeasurementAvailable = () => false;
export const getMetaMeasurementSaveError = (): string | null => null;
export const getMetaMeasurementConsent = async () => false;
export const setMetaMeasurementConsent = async (_enabled: boolean) => false;
export const resumeMetaMeasurement = async () => {};
export const logMetaOwnerRegistration = async () => {};
