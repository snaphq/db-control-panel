import { colors } from "../../scripts/lib/colors";
import { printHeader } from "../../scripts/lib/log";
import { confirm, input, password } from "../../scripts/lib/prompts";
import type { SetupVariableContext } from "./types";

interface BetterAuthConfigParams extends SetupVariableContext {
  appUrl: string;
  generateSecret: (length?: number) => string;
  printUpdateWarning: (
    key: string,
    oldValue: string,
    isSecret?: boolean,
  ) => void;
}

export async function configureBetterAuthVariables(
  params: BetterAuthConfigParams,
) {
  const {
    appUrl,
    existingEnv,
    isUpdating,
    newVariables,
    changes,
    generateSecret,
    printUpdateWarning,
  } = params;

  printHeader("BETTERAUTH CONFIGURATION");

  const existingSecret = existingEnv.get("BETTER_AUTH_SECRET");
  const existingUrl = existingEnv.get("BETTER_AUTH_URL");

  let secret: string;
  if (existingSecret && isUpdating) {
    printUpdateWarning("BETTER_AUTH_SECRET", existingSecret, true);
    const regenerate = await confirm({
      message: "Regenerate secret?",
      default: false,
    });
    secret = regenerate ? generateSecret() : existingSecret;
    if (regenerate) {
      changes.push({
        key: "BETTER_AUTH_SECRET",
        oldValue: "(regenerated)",
        newValue: "(new secret)",
      });
    }
  } else {
    console.log(
      `${colors.green}  Auto-generating BETTER_AUTH_SECRET...${colors.reset}`,
    );
    secret = generateSecret();
  }

  newVariables.push({
    key: "BETTER_AUTH_SECRET",
    value: secret,
    section: "BetterAuth",
  });
  newVariables.push({
    key: "BETTER_AUTH_URL",
    value: existingUrl || appUrl,
    section: "BetterAuth",
  });

  console.log("");
  const existingGoogleClientId = existingEnv.get(
    "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
  );
  const existingGoogleClientSecret = existingEnv.get("GOOGLE_CLIENT_SECRET");
  const hasExistingGoogle = !!(
    existingGoogleClientId && existingGoogleClientSecret
  );

  const configureGoogle = await confirm({
    message: `Configure Google OAuth login?${hasExistingGoogle ? " (existing config found)" : ""}`,
    default: hasExistingGoogle,
  });

  if (configureGoogle) {
    console.log("");
    console.log(
      `${colors.dim}  Get credentials from: ${colors.cyan}https://console.cloud.google.com/apis/credentials${colors.reset}`,
    );
    console.log(
      `${colors.dim}  Add this redirect URI: ${colors.cyan}${appUrl}/api/auth/callback/google${colors.reset}`,
    );
    console.log("");

    if (existingGoogleClientId && isUpdating) {
      printUpdateWarning(
        "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
        existingGoogleClientId,
      );
    }
    const googleClientId = await input({
      message: "Google Client ID:",
      default: existingGoogleClientId || "",
    });

    if (existingGoogleClientSecret && isUpdating) {
      printUpdateWarning(
        "GOOGLE_CLIENT_SECRET",
        existingGoogleClientSecret,
        true,
      );
    }
    const googleClientSecret = await password({
      message: "Google Client Secret:",
      mask: "*",
    });

    if (googleClientId) {
      newVariables.push({
        key: "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
        value: googleClientId,
        section: "BetterAuth",
      });
    }
    if (googleClientSecret || existingGoogleClientSecret) {
      newVariables.push({
        key: "GOOGLE_CLIENT_SECRET",
        value: googleClientSecret || existingGoogleClientSecret || "",
        section: "BetterAuth",
      });
    }
  } else if (hasExistingGoogle && isUpdating) {
    if (existingGoogleClientId) {
      newVariables.push({
        key: "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
        value: existingGoogleClientId,
        section: "BetterAuth",
      });
    }
    if (existingGoogleClientSecret) {
      newVariables.push({
        key: "GOOGLE_CLIENT_SECRET",
        value: existingGoogleClientSecret,
        section: "BetterAuth",
      });
    }
  }
}
