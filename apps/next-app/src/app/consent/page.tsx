"use client";

import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function ConsentContent() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthParams, setOauthParams] = useState<{
    client_id: string;
    redirect_uri: string;
    state: string;
    response_type: string;
    scope: string;
    code_challenge_method: string;
    code_challenge: string;
    timestamp: number;
  } | null>(null);
  const searchParams = useSearchParams();

  const client_id = searchParams.get("client_id");
  const scope = searchParams.get("scope");
  const consent_code = searchParams.get("consent_code");
  const redirect_uri = searchParams.get("redirect_uri");

  // Retrieve stored OAuth parameters from localStorage
  useEffect(() => {
    try {
      const storedParams = localStorage.getItem("oauth_params");
      if (storedParams) {
        const params = JSON.parse(storedParams);
        const isExpired = Date.now() - params.timestamp > 5 * 60 * 1000;

        if (!isExpired && params.client_id === client_id) {
          setOauthParams(params);
        } else {
          localStorage.removeItem("oauth_params");
        }
      }
    } catch {
      try {
        localStorage.removeItem("oauth_params");
      } catch {
        // Silent fail if localStorage is not available
      }
    }
  }, [client_id]);

  const scopes = scope?.split(" ") || [];
  const scopeDescriptions: Record<string, string> = {
    openid: "Access your basic profile information",
    profile: "Access your profile details (name, picture)",
    email: "Access your email address",
  };

  const handleConsent = async (granted: boolean) => {
    setLoading(true);
    setError(null);

    try {
      if (consent_code) {
        const response = await fetch("/api/auth/oauth2/consent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accept: granted,
            consent_code: consent_code,
          }),
        });

        if (response.ok) {
          const data = await response.json();

          try {
            localStorage.removeItem("oauth_params");
          } catch {
            // Silent fail
          }

          if (data.redirect_uri || data.redirectURI) {
            window.location.href = data.redirect_uri || data.redirectURI;
          } else {
            const redirectUri = oauthParams?.redirect_uri || redirect_uri;
            const state = oauthParams?.state;
            const authCode = data.code || data.authorization_code;

            if (authCode && state && redirectUri) {
              window.location.href = `${redirectUri}?code=${authCode}&state=${state}`;
            } else if (redirectUri) {
              window.location.href = redirectUri;
            } else {
              window.location.href = "/";
            }
          }
        } else {
          const responseText = await response.text();
          let errorData: {
            error?: string;
            error_description?: string;
          } = {};
          try {
            errorData = JSON.parse(responseText);
          } catch {
            errorData = { error: responseText || "Unknown error" };
          }

          // Try fallback without consent_code (cookie-based approach)
          const fallbackResponse = await fetch("/api/auth/oauth2/consent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accept: granted }),
          });

          if (fallbackResponse.ok) {
            const fallbackData = await fallbackResponse.json();

            try {
              localStorage.removeItem("oauth_params");
            } catch {
              // Silent fail
            }

            if (fallbackData.redirect_uri || fallbackData.redirectURI) {
              window.location.href =
                fallbackData.redirect_uri || fallbackData.redirectURI;
            } else {
              const redirectUri = oauthParams?.redirect_uri || redirect_uri;
              const state = oauthParams?.state;
              const authCode =
                fallbackData.code || fallbackData.authorization_code;

              if (authCode && state && redirectUri) {
                window.location.href = `${redirectUri}?code=${authCode}&state=${state}`;
              } else if (redirectUri) {
                window.location.href = redirectUri;
              } else {
                window.location.href = "/";
              }
            }
            return;
          }

          setError(
            errorData.error_description ||
              errorData.error ||
              `HTTP ${response.status}: An error occurred`,
          );
        }
      } else if (oauthParams) {
        const params = new URLSearchParams();
        params.append("client_id", oauthParams.client_id);
        params.append("scope", scope || oauthParams.scope);
        params.append("redirect_uri", oauthParams.redirect_uri);
        params.append("state", oauthParams.state);
        params.append("response_type", oauthParams.response_type);
        params.append("accept", granted ? "true" : "false");

        const response = await fetch(
          `/api/auth/oauth2/consent?${params.toString()}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          },
        );

        if (response.ok) {
          const data = await response.json();

          try {
            localStorage.removeItem("oauth_params");
          } catch {
            // Silent fail
          }

          if (data.redirect_uri) {
            window.location.href = data.redirect_uri;
          }
        } else {
          const errorData = await response
            .json()
            .catch(() => ({ error: "Unknown error" }));
          setError(
            errorData.error_description ||
              errorData.error ||
              `HTTP ${response.status}: An error occurred`,
          );
        }
      } else {
        setError("Missing OAuth parameters. Please try signing in again.");
      }
    } catch {
      setError("Failed to process consent");
    } finally {
      setLoading(false);
    }
  };

  if (!client_id && !consent_code) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Invalid Request</CardTitle>
            <CardDescription>
              Missing required parameters (client_id or consent_code)
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Authorize Application</CardTitle>
          <CardDescription>
            An application is requesting access to your account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Application Details:</h3>
            <p className="text-sm text-muted-foreground">
              Client ID: {client_id}
            </p>
            {(redirect_uri || oauthParams?.redirect_uri) && (
              <p className="text-sm text-muted-foreground">
                Redirect URI: {redirect_uri || oauthParams?.redirect_uri}
              </p>
            )}
          </div>

          {scopes.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Requested Permissions:</h3>
              <ul className="space-y-1">
                {scopes.map((scopeItem) => (
                  <li key={scopeItem} className="text-sm">
                    <strong>{scopeItem}:</strong>{" "}
                    {scopeDescriptions[scopeItem] || "Access to this scope"}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-destructive text-sm">{error}</p>
            </div>
          )}

          <div className="flex space-x-3">
            <Button
              onClick={() => handleConsent(false)}
              variant="outline"
              disabled={loading}
              className="flex-1"
            >
              Deny
            </Button>
            <Button
              onClick={() => handleConsent(true)}
              disabled={loading}
              className="flex-1"
            >
              {loading ? "Processing..." : "Allow"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Loading...</CardTitle>
          <CardDescription>
            Please wait while we load the consent form
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

export default function ConsentPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ConsentContent />
    </Suspense>
  );
}
