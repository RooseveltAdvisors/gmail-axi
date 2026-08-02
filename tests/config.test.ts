import { describe, expect, it } from "vitest";
import { ConfigError, parseAccountsToml, validateAccountId } from "../src/config.js";

describe("account configuration", () => {
  it("parses only the documented identity-free account shape", () => {
    expect(parseAccountsToml(`[accounts.work]\nemail = "you@example.com"\nclient_id_env = "TEST_CLIENT_ID"\nclient_secret_env = "TEST_CLIENT_SECRET"\nrefresh_token_env = "TEST_REFRESH"`)).toEqual([
      {
        key: "work",
        email: "you@example.com",
        clientIdEnv: "TEST_CLIENT_ID",
        clientSecretEnv: "TEST_CLIENT_SECRET",
        refreshTokenEnv: "TEST_REFRESH",
        accessTokenEnv: undefined,
      },
    ]);
  });

  it("rejects unsafe account keys before they reach filesystem paths", () => {
    expect(() => validateAccountId("../personal")).toThrow(ConfigError);
    expect(() => parseAccountsToml(`[accounts.bad/key]\nemail = "you@example.com"\nclient_id_env = "ID"\nclient_secret_env = "SECRET"`)).toThrow(ConfigError);
  });
});
