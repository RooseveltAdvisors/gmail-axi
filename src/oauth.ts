import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { authMaterial, saveRefreshToken } from "./config.js";
import type { Account, ConfigState } from "./types.js";
import type { FetchLike } from "./gmail.js";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/gmail.modify";

export async function authorizeAccount(
  config: ConfigState,
  account: Account,
  env: NodeJS.ProcessEnv = process.env,
  fetcher: FetchLike = fetch,
): Promise<{ account: string; status: "authorized"; storage: "user-local" }> {
  const material = await authMaterial(config, { ...account, refreshTokenEnv: undefined }, env).catch(async (error) => {
    const clientId = env[account.clientIdEnv];
    const clientSecret = env[account.clientSecretEnv];
    if (!clientId || !clientSecret) throw error;
    return { clientId, clientSecret };
  });
  const state = randomBytes(16).toString("hex");
  const server = createServer();
  const code = await new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(new Error("OAuth authorization timed out"));
    }, 5 * 60 * 1000);
    server.on("request", (request, response) => {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (url.pathname !== "/oauth2callback") {
        response.writeHead(404).end();
        return;
      }
      if (url.searchParams.get("state") !== state) {
        response.writeHead(400).end("Authorization state mismatch");
        clearTimeout(timer);
        server.close();
        reject(new Error("OAuth authorization state mismatch"));
        return;
      }
      const authorizationCode = url.searchParams.get("code");
      if (!authorizationCode) {
        response.writeHead(400).end("Authorization was denied");
        clearTimeout(timer);
        server.close();
        reject(new Error("OAuth authorization was denied"));
        return;
      }
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end("Authorization complete. You can close this window.\n");
      clearTimeout(timer);
      server.close();
      resolve({ code: authorizationCode, redirectUri: `http://127.0.0.1:${port}/oauth2callback` });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
      const authorizationUrl = new URL(AUTH_ENDPOINT);
      authorizationUrl.search = new URLSearchParams({
        client_id: material.clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        access_type: "offline",
        prompt: "consent",
        scope: SCOPE,
        state,
      }).toString();
      openBrowser(authorizationUrl.toString());
    });
  });

  const response = await fetcher(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: code.code,
      client_id: material.clientId,
      client_secret: material.clientSecret,
      redirect_uri: code.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) throw new Error("Google authorization token exchange failed");
  const tokens = (await response.json()) as { refresh_token?: unknown };
  if (typeof tokens.refresh_token !== "string") throw new Error("Google authorization returned no refresh token");
  await saveRefreshToken(config, account, tokens.refresh_token);
  return { account: account.key, status: "authorized", storage: "user-local" };
}

function openBrowser(url: string): void {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  const child = spawn(command, [url], { detached: true, stdio: "ignore", shell: process.platform === "win32" });
  child.unref();
}
