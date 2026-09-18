import { describe, expect, it } from "vitest";
import { isVaultRef, parseVaultRef, resolveVaultRef, VaultError } from "../src/vault.js";

describe("vault references", () => {
  it("parses a reference into vault, item, and field", () => {
    expect(parseVaultRef("op://Example Vault/Example Gmail OAuth/client_id")).toEqual({
      vault: "Example Vault",
      item: "Example Gmail OAuth",
      field: "client_id",
    });
    // Item titles routinely contain a colon; `op item get` tolerates it.
    expect(parseVaultRef("op://Vault/example: Gmail OAuth/client_secret")?.item).toBe("example: Gmail OAuth");
  });

  it("rejects anything that is not a well-formed reference", () => {
    for (const value of [
      "op://Vault/Item",
      "op://Vault/Item/field/extra",
      "op://Vault//field",
      "op://Vault/Item/field\nmalicious",
      "$(cat /etc/passwd)",
      "~/.config/gmail-axi/credentials.env",
      "",
    ]) {
      expect(parseVaultRef(value)).toBeUndefined();
    }
    expect(isVaultRef("op://Vault/Item/field")).toBe(true);
    expect(isVaultRef("GMAIL_AXI_CLIENT_ID")).toBe(false);
  });

  it("reports a malformed reference instead of invoking the vault", async () => {
    await expect(resolveVaultRef("op://Vault/Item")).rejects.toMatchObject({ code: "vault_ref_invalid" });
    await expect(resolveVaultRef("op://Vault/Item")).rejects.toBeInstanceOf(VaultError);
  });
});
