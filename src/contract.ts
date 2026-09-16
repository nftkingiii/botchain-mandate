import { createPublicClient, defineChain, http, parseAbi } from "viem";
import type { Address, Hex } from "viem";

export const botTestnet = defineChain({
  id: 968,
  name: "BOT Chain Testnet",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.bohr.life"] } },
  blockExplorers: { default: { name: "BOT Scan", url: "https://scan.bohr.life" } },
  testnet: true,
});

const configuredAddress = import.meta.env.VITE_MANDATE_PROOF_ADDRESS;
export const CONTRACT_ADDRESS = configuredAddress as Address | undefined;
export const DEPLOYMENT_BLOCK = BigInt(import.meta.env.VITE_MANDATE_DEPLOYMENT_BLOCK || "0");
export const PROOF_ABI = parseAbi([
  "function principal() view returns (address)",
  "function mandateDigest() view returns (bytes32)",
  "function expiresAt() view returns (uint48)",
  "function allowedSelectors(bytes4) view returns (bool)",
  "function prove(bytes4 selector)",
  "event MandateExecuted(bytes4 indexed selector, bytes32 indexed digest, address indexed caller)",
]);

export const publicClient = createPublicClient({ chain: botTestnet, transport: http() });

export type ContractSnapshot = {
  blockNumber: bigint;
  bytecode: Hex;
  principal: Address;
  digest: Hex;
  expiresAt: bigint;
};

export async function readContractSnapshot(): Promise<ContractSnapshot> {
  if (!CONTRACT_ADDRESS) throw new Error("Set VITE_MANDATE_PROOF_ADDRESS to the verified deployed contract address.");
  const [chainId, blockNumber, bytecode, principal, digest, expiresAt] = await Promise.all([
    publicClient.getChainId(),
    publicClient.getBlockNumber(),
    publicClient.getCode({ address: CONTRACT_ADDRESS }),
    publicClient.readContract({ address: CONTRACT_ADDRESS, abi: PROOF_ABI, functionName: "principal" }),
    publicClient.readContract({ address: CONTRACT_ADDRESS, abi: PROOF_ABI, functionName: "mandateDigest" }),
    publicClient.readContract({ address: CONTRACT_ADDRESS, abi: PROOF_ABI, functionName: "expiresAt" }),
  ]);
  if (chainId !== botTestnet.id) throw new Error(`RPC chain mismatch: expected ${botTestnet.id}, received ${chainId}`);
  if (!bytecode || bytecode === "0x") throw new Error("No contract bytecode at the configured address.");
  return { blockNumber: BigInt(blockNumber), bytecode, principal, digest, expiresAt: BigInt(expiresAt) };
}

export async function isSelectorAllowed(selector: Hex): Promise<boolean> {
  if (!CONTRACT_ADDRESS) throw new Error("Contract address is not configured.");
  return publicClient.readContract({ address: CONTRACT_ADDRESS, abi: PROOF_ABI, functionName: "allowedSelectors", args: [selector] });
}

export async function readProofReceipts(fromBlock = 0n) {
  if (!CONTRACT_ADDRESS) throw new Error("Contract address is not configured.");
  return publicClient.getContractEvents({ address: CONTRACT_ADDRESS, abi: PROOF_ABI, eventName: "MandateExecuted", fromBlock: fromBlock || DEPLOYMENT_BLOCK, toBlock: "latest" });
}
