// Public-address-only funding helper. It never receives a seed or faucet body.
export async function ensureFunded(
  address,
  { account, faucet, wait, attempts = 12 },
) {
  let state = await account(address);
  if (state.account_data) return state.account_data;
  if (state.error !== "actNotFound")
    throw new Error("Cannot verify Testnet account funding.");
  if (!(await faucet(address)))
    throw new Error(
      "Testnet faucet unavailable; resume setup later with the same address.",
    );
  for (let n = 0; n < attempts; n++) {
    state = await account(address);
    if (state.account_data) return state.account_data;
    await wait(2000);
  }
  throw new Error(
    "Faucet funding is not yet validated; resume setup with the same address.",
  );
}
