# Mandate

Mandate is a permission desk for reviewing bounded authorization proposals and reading the immutable evidence contract on BOT Chain Testnet. It is distinct from an execution agent: it does not submit DeFi actions or enforce the proposed contract/selector table. New drafts are stored locally in the browser, scoped to chain, contract and connected account.

The deployed `MandateProof` records a principal, a digest, an expiry, and an immutable selector allowlist. Anyone can call `prove(bytes4)` for an allowed selector to emit a `MandateExecuted` event. This is an evidence marker only: it neither grants the caller permission nor executes the named business operation. Its immutable parameters cannot be edited or revoked after deployment.

Verified deployment and source: [BOTCHAIN_TESTNET.md](BOTCHAIN_TESTNET.md).

## Web service

Requirements: Node.js 22+ and pnpm 11.11.0. Install deterministically, then build and run:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm verify
pnpm start
```

The service binds to `0.0.0.0:$PORT`, serves SPA deep links, and provides `/healthz` with a revision string. For local development copy `.env.example` to `.env` and run `pnpm dev`. `VITE_MANDATE_PROOF_ADDRESS` and `VITE_MANDATE_DEPLOYMENT_BLOCK` are public deployment configuration values (not secrets); set them in Railway before building. The current verified contract is `0xcce4720bcF9C5338c63A4Efa9DB32C8Ff86B08c6`, deployed at block `23592184`.

## Workflows

- **Draft** — compose a local proposal, compute visible EVM selectors, review allow/deny rows, expiry and digest, and export JSON. Saving does not deploy or alter the contract.
- **Inspect** — public RPC reads chain ID, latest block, bytecode and immutable values; query the selector allowlist.
- **Receipts** — read `MandateExecuted` events from the deployment block forward. A receipt does not attest to an underlying action.

Writing is an explicit, optional wallet flow. The UI checks the selector against the immutable deployed allowlist, simulates the exact ABI call, then asks the user wallet to submit `prove(bytes4)`. It never prompts automatically, handles a private key, or submits a transaction without wallet confirmation. BOT Chain Testnet uses chain ID 968, RPC `https://rpc.bohr.life`, native token BOT, and explorer `https://scan.bohr.life`.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm build
forge build
forge test
```
