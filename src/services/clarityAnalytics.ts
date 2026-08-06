import { getAppSettings } from "../utils/appSettings";
import { hasCurrentLegalConsent } from "../utils/legalConsent";
import { logger } from "../utils/logger";

let clarityClient: (typeof import("@microsoft/clarity"))["default"] | null = null;
let clarityProjectId = "";
let initializationPromise: Promise<boolean> | null = null;

type ImmersiveClockGlobal = typeof globalThis & {
  __IMMERSIVE_CLOCK_PRERENDER__?: boolean;
};

function isPrerendering(): boolean {
  return (globalThis as ImmersiveClockGlobal).__IMMERSIVE_CLOCK_PRERENDER__ === true;
}

export interface ClarityEligibilityInput {
  production: boolean;
  deploymentEnabled: boolean;
  projectId: string | undefined;
  legalConsentAccepted: boolean;
  experienceProgramEnabled: boolean;
}

export function isClarityEligible({
  deploymentEnabled,
  experienceProgramEnabled,
  legalConsentAccepted,
  production,
  projectId,
}: ClarityEligibilityInput): boolean {
  return (
    production &&
    deploymentEnabled &&
    Boolean(projectId?.trim()) &&
    legalConsentAccepted &&
    experienceProgramEnabled
  );
}

export function isClarityDeploymentConfigured(): boolean {
  return isClarityEligible({
    production: import.meta.env.PROD,
    deploymentEnabled: import.meta.env.VITE_ENABLE_CLARITY === "true",
    projectId: import.meta.env.VITE_CLARITY_PROJECT_ID,
    legalConsentAccepted: true,
    experienceProgramEnabled: true,
  });
}

export function shouldEnableClarity(): boolean {
  if (isPrerendering()) return false;
  return isClarityEligible({
    production: import.meta.env.PROD,
    deploymentEnabled: import.meta.env.VITE_ENABLE_CLARITY === "true",
    projectId: import.meta.env.VITE_CLARITY_PROJECT_ID,
    legalConsentAccepted: hasCurrentLegalConsent(),
    experienceProgramEnabled: getAppSettings().general.analytics.experienceProgramEnabled,
  });
}

export async function initializeClarityIfAllowed(): Promise<boolean> {
  if (!shouldEnableClarity()) return false;
  const projectId = import.meta.env.VITE_CLARITY_PROJECT_ID?.trim() ?? "";
  if (clarityClient && clarityProjectId === projectId) return true;
  if (initializationPromise) return initializationPromise;

  initializationPromise = import("@microsoft/clarity")
    .then(({ default: Clarity }) => {
      Clarity.init(projectId);
      Clarity.consentV2({ ad_Storage: "denied", analytics_Storage: "granted" });
      clarityClient = Clarity;
      clarityProjectId = projectId;
      return true;
    })
    .catch((error) => {
      logger.warn("Analytics initialization failed", error);
      return false;
    })
    .finally(() => {
      initializationPromise = null;
    });

  return initializationPromise;
}

export function revokeClarityConsent(): void {
  if (!clarityClient) return;
  try {
    clarityClient.consentV2({ ad_Storage: "denied", analytics_Storage: "denied" });
  } catch (error) {
    logger.warn("Analytics consent revocation failed", error);
  }
}
