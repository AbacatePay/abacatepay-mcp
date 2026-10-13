import type { NextFunction, Request, Response } from "express";
import { apiKey as globalApiKey } from "../config.js";
import { serverBase } from "../oauth/routes.js";
import { ACCESS_TOKEN_PREFIX, resolveAccessToken } from "../oauth/store.js";

export type RequestWithValidatedApiKey = Request & {
  validatedApiKey?: string;
};

function unauthorized(res: Response, message: string, invalidToken = false): void {
  const resourceMetadataUrl = `${serverBase()}/.well-known/oauth-protected-resource`;
  const error = invalidToken ? ', error="invalid_token"' : "";
  res.setHeader(
    "WWW-Authenticate",
    `Bearer realm="abacatepay-mcp"${error}, resource_metadata="${resourceMetadataUrl}"`,
  );
  res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32001, message },
    id: null,
  });
}

/**
 * Extract API key from Authorization (Bearer) or X-API-Key, else global config.
 * OAuth access tokens (mcp_at_…) are resolved to the API key they were issued for;
 * anything else is taken as the API key itself.
 */
export function validateApiKeyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  const headerKey = req.headers["x-api-key"];
  const apiKeyHeader = typeof headerKey === "string" ? headerKey : undefined;

  let fromRequest: string | undefined;
  if (authHeader?.startsWith("Bearer ")) {
    fromRequest = authHeader.slice(7);
  } else if (apiKeyHeader) {
    fromRequest = apiKeyHeader;
  }

  let finalKey = fromRequest?.trim() || globalApiKey?.trim() || "";

  if (finalKey.startsWith(ACCESS_TOKEN_PREFIX)) {
    const resolved = resolveAccessToken(finalKey);
    if (!resolved) {
      unauthorized(res, "Unauthorized: access token is invalid or was revoked. Reconnect via OAuth.", true);
      return;
    }
    finalKey = resolved;
  }

  if (!finalKey) {
    unauthorized(res, "Unauthorized: connect via OAuth or pass Authorization: Bearer <key>.");
    return;
  }

  (req as RequestWithValidatedApiKey).validatedApiKey = finalKey;
  next();
}
