import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowDownToLine, ArrowUpRight, Check, ChevronDown, CircleAlert, Clock3, Copy, ExternalLink, FileCheck2, FilePlus2, Fingerprint, LoaderCircle, LockKeyhole, Plus, Radio, RefreshCw, ShieldCheck, Wallet, X } from "lucide-react";
import { createWalletClient, custom, isAddress, isHex as viemIsHex } from "viem";
import { botTestnet, CONTRACT_ADDRESS, PROOF_ABI, publicClient, readContractSnapshot, readProofReceipts, isSelectorAllowed } from "./contract";
import type { ContractSnapshot } from "./contract";
import { summarizeSignature } from "./selector";
import "./style.css";

type Tab = "draft" | "inspect" | "receipts";
type Row = { target: string; signature: string; selector: string; allowed: boolean };
type Draft = { id: string; principal: string; agent: string; digest: string; expires: string; rows: Row[]; updated: string };
type ReceiptRow = { hash: string; blockNumber: bigint; selector: string; digest: string; caller: string; timestamp?: bigint };

function isHex(value: string, options?: { size?: number }) {
  return viemIsHex(value) && (options?.size === undefined || value.length === 2 + options.size * 2);
}

const EMPTY_ROW = (): Row => ({ target: "", signature: "", selector: "", allowed: true });
const EMPTY_DRAFT = (): Draft => ({ id: crypto.randomUUID(), principal: "", agent: "", digest: "", expires: "", rows: [EMPTY_ROW()], updated: new Date().toISOString() });
const initialTab = (): Tab => {
  const route = location.hash.replace("#", "");
  return ["draft", "inspect", "receipts"].includes(route) ? route as Tab : "draft";
};
function storageScope(account?: string | null) { return `mandate:v1:968:${CONTRACT_ADDRESS?.toLowerCase() ?? "unconfigured"}:${account?.toLowerCase() ?? "unconnected"}`; }

function readDrafts(account?: string | null): Draft[] {
  try { return JSON.parse(localStorage.getItem(storageScope(account)) ?? "[]") as Draft[]; } catch { return []; }
}
function short(value: string, left = 8, right = 5) { return value.length > left + right + 3 ? `${value.slice(0, left)}…${value.slice(-right)}` : value; }
function fmtTime(unix: bigint | number) { return new Date(Number(unix) * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); }
function App() {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [draft, setDraft] = useState<Draft>(() => EMPTY_DRAFT());
  const [drafts, setDrafts] = useState<Draft[]>(() => readDrafts(null));
  const [snapshot, setSnapshot] = useState<ContractSnapshot | null>(null);
  const [snapshotState, setSnapshotState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [snapshotError, setSnapshotError] = useState("");
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [receiptState, setReceiptState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [receiptError, setReceiptError] = useState("");
  const [account, setAccount] = useState<string | null>(null);
  const [walletChain, setWalletChain] = useState<number | null>(null);
  const [txState, setTxState] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => { localStorage.setItem(storageScope(account), JSON.stringify(drafts)); }, [drafts, account]);
  useEffect(() => {
    const onHash = () => setTab(initialTab());
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    const ethereum = (window as Window & { ethereum?: any }).ethereum;
    if (!ethereum?.request) return;
    void ethereum.request({ method: "eth_accounts" }).then((accounts: string[]) => { const next = accounts[0] ?? null; setAccount(next); if (next) setDrafts(readDrafts(next)); }).catch(() => setAccount(null));
    void ethereum.request({ method: "eth_chainId" }).then((id: string) => setWalletChain(Number(BigInt(id)))).catch(() => setWalletChain(null));
    const onAccounts = (accounts: string[]) => { const next = accounts[0] ?? null; setAccount(next); setTxState(""); setDrafts(readDrafts(next)); };
    const onChain = (id: string) => { setWalletChain(Number(BigInt(id))); setSnapshot(null); setTxState(""); };
    ethereum.on?.("accountsChanged", onAccounts); ethereum.on?.("chainChanged", onChain);
    return () => { ethereum.removeListener?.("accountsChanged", onAccounts); ethereum.removeListener?.("chainChanged", onChain); };
  }, []);

  const readyRows = useMemo(() => draft.rows.map((row) => ({ ...row, computed: summarizeSignature(row.signature) })), [draft.rows]);
  const deadline = draft.expires ? new Date(draft.expires) : null;
  const expiring = deadline ? deadline.getTime() - Date.now() < 24 * 60 * 60 * 1000 : false;
  const canSave = Boolean(isAddress(draft.principal) && draft.digest && /^0x[\da-fA-F]{64}$/.test(draft.digest) && deadline && deadline.getTime() > Date.now() && readyRows.some((r) => r.computed));

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft((prev) => ({ ...prev, [key]: value, updated: new Date().toISOString() })); }
  function updateRow(index: number, update: Partial<Row>) { setDraft((prev) => ({ ...prev, rows: prev.rows.map((r, i) => i === index ? { ...r, ...update } : r), updated: new Date().toISOString() })); }
  function navigate(next: Tab) { location.hash = next; setTab(next); }
  function saveDraft() {
    if (!canSave) return;
    const stored = { ...draft, rows: draft.rows.map((r, i) => ({ ...r, selector: readyRows[i]?.computed ?? r.selector })) };
    setDrafts((items) => [stored, ...items.filter((item) => item.id !== stored.id)]);
    setDraft(stored); setNotice("Draft saved on this device only."); setTimeout(() => setNotice(""), 2600);
  }
  function loadDraft(saved: Draft) { setDraft(saved); navigate("draft"); }
  async function connectWallet() {
    const ethereum = (window as Window & { ethereum?: any }).ethereum;
    if (!ethereum?.request) { setTxState("No injected wallet found. Public reads are still available without connecting."); return; }
    try {
      const accounts = await ethereum.request({ method: "eth_requestAccounts" }); setAccount(accounts[0] ?? null); setDrafts(readDrafts(accounts[0] ?? null));
      const chain = Number(BigInt(await ethereum.request({ method: "eth_chainId" }))); setWalletChain(chain);
      if (chain !== botTestnet.id) await switchToTestnet(ethereum);
      setTxState("Wallet connected. Review the selected draft before recording its proof.");
    } catch (error) { setTxState(error instanceof Error ? error.message : "Wallet connection was declined."); }
  }
  async function switchToTestnet(ethereum: any) {
    try { await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x3c8" }] }); }
    catch (error: any) {
      if (error?.code !== 4902) throw error;
      await ethereum.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x3c8", chainName: "BOT Chain Testnet", nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 }, rpcUrls: ["https://rpc.bohr.life"], blockExplorerUrls: ["https://scan.bohr.life"] }] });
    }
    setWalletChain(968);
  }
  async function readInspect() {
    setSnapshotState("loading"); setSnapshotError("");
    try { setSnapshot(await readContractSnapshot()); setSnapshotState("ready"); }
    catch (error) { setSnapshotState("error"); setSnapshotError(error instanceof Error ? error.message : "Contract read failed."); }
  }
  async function readReceipts() {
    setReceiptState("loading"); setReceiptError("");
    try {
      const logs = await readProofReceipts();
      setReceipts(logs.map((log) => ({ hash: log.transactionHash ?? "", blockNumber: log.blockNumber ?? 0n, selector: log.args.selector ?? "0x00000000", digest: log.args.digest ?? "0x", caller: log.args.caller ?? "" })).reverse());
      setReceiptState("ready");
    } catch (error) { setReceiptState("error"); setReceiptError(error instanceof Error ? error.message : "Receipt query failed."); }
  }
  async function recordProof(selector: string) {
    const ethereum = (window as Window & { ethereum?: any }).ethereum;
    if (!account || !ethereum?.request) return setTxState("Connect a wallet first.");
    if (walletChain !== 968) return setTxState("Switch to BOT Chain Testnet before submitting.");
    if (!CONTRACT_ADDRESS) return setTxState("Contract address is not configured.");
    if (!isHex(selector, { size: 4 })) return setTxState("Selector must be exactly 4 bytes.");
    setBusy(true); setTxState("Checking selector against the deployed allowlist…");
    try {
      const allowed = await isSelectorAllowed(selector as `0x${string}`);
      if (!allowed) throw new Error("This selector is not in the deployed contract's immutable allowlist.");
      setTxState("Simulating prove(bytes4)…");
      const { request } = await publicClient.simulateContract({ account: account as `0x${string}`, address: CONTRACT_ADDRESS, abi: PROOF_ABI, functionName: "prove", args: [selector as `0x${string}`] });
      setTxState("Simulation passed. Review and confirm in your wallet.");
      const walletClient = createWalletClient({ account: account as `0x${string}`, chain: botTestnet, transport: custom(ethereum) });
      const txHash = await walletClient.writeContract(request);
      setTxState(`Submitted ${txHash}. Waiting for confirmation…`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
      setTxState(receipt.status === "success" ? `Confirmed in block ${receipt.blockNumber}. This records proof only; it does not execute the permitted business action.` : `Transaction reverted in block ${receipt.blockNumber}.`);
      if (receipt.status === "success") void readReceipts();
    } catch (error: any) { setTxState(error?.code === 4001 ? "Wallet request rejected." : error instanceof Error ? error.message : "Proof transaction failed."); }
    finally { setBusy(false); }
  }
  function exportDraft() {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `mandate-${draft.id.slice(0, 8)}.json`; link.click(); URL.revokeObjectURL(url);
  }

  return <div className="app-shell">
    <aside className="rail"><a className="brand" href="#draft" aria-label="Mandate home"><img src="/mandate-mark.svg" alt="" /><span>mandate</span></a><div className="rail-caption">WORKSPACE</div><nav className="rail-nav" aria-label="Workflows">
      {([ ["draft", FilePlus2, "Draft"], ["inspect", Fingerprint, "Inspect"], ["receipts", FileCheck2, "Receipts"] ] as const).map(([id, Icon, label]) => <button key={id} className={tab === id ? "rail-item active" : "rail-item"} onClick={() => navigate(id)} aria-current={tab === id ? "page" : undefined}><Icon size={17}/><span>{label}</span></button>)}
    </nav><div className="rail-bottom"><div className="network-line"><span className="signal-dot"/>BOT Chain Testnet</div><span className="mono tiny">CHAIN 968 · BOT</span><a href="https://scan.bohr.life" target="_blank" rel="noreferrer" className="rail-link">Open explorer <ArrowUpRight size={13}/></a></div></aside>
    <main className="main-area"><header className="topbar"><div className="breadcrumbs"><span>Permission desk</span><ChevronDown size={14}/><strong>{tab[0].toUpperCase() + tab.slice(1)}</strong></div><div className="top-actions"><span className="rpc-status"><span className="signal-dot"/>Reads public</span><button className="wallet-button" onClick={account ? () => { setAccount(null); setTxState("Wallet disconnected in this interface."); } : connectWallet}><Wallet size={15}/>{account ? short(account) : "Connect wallet"}</button></div></header>
      <div className="content">
        {tab === "draft" && <>
          <div className="page-heading"><div><h1>Draft a permission</h1><p>Make every boundary concrete before recording evidence.</p></div><div className="heading-actions"><button className="button subtle" onClick={exportDraft} disabled={!draft.digest}><ArrowDownToLine size={15}/> Export</button><button className="button primary" onClick={saveDraft} disabled={!canSave}><Check size={15}/> Save draft</button></div></div>
          <div className="compose-grid"><section className="form-workspace" aria-label="Permission draft inputs">
            <div className="form-section"><div className="section-title"><span className="step">01</span><div><h2>Participants</h2><p>Who is granting the bounded mandate, and which agent is it for?</p></div></div><label className="field"><span>Principal wallet</span><div className="input-with-action"><input value={draft.principal} onChange={(e) => setField("principal", e.target.value)} placeholder="0x…" spellCheck={false} autoComplete="off" aria-invalid={Boolean(draft.principal && !isAddress(draft.principal))}/>{account && <button className="inline-link" onClick={() => setField("principal", account)}>Use connected</button>}</div>{draft.principal && !isAddress(draft.principal) && <small className="field-error">Enter a valid EVM address.</small>}</label><label className="field"><span>Agent or service label <em>Optional</em></span><input value={draft.agent} onChange={(e) => setField("agent", e.target.value)} placeholder="e.g. Treasury rebalancer" maxLength={80}/></label></div>
            <div className="form-section"><div className="section-title"><span className="step">02</span><div><h2>Call boundaries</h2><p>Describe allowed and denied function selectors. These are draft details; the deployed contract’s allowlist is immutable.</p></div></div><div className="permission-table"><div className="table-head"><span>CONTRACT TARGET</span><span>FUNCTION SIGNATURE</span><span>MODE</span><span/></div>{draft.rows.map((row, index) => <div className="permission-row" key={index}><input aria-label={`Contract target ${index + 1}`} value={row.target} onChange={(e) => updateRow(index, { target: e.target.value })} placeholder="0x contract address" spellCheck={false}/><div className="signature-cell"><input aria-label={`Function signature ${index + 1}`} value={row.signature} onChange={(e) => updateRow(index, { signature: e.target.value })} placeholder="rebalance() or 0x12345678" className="mono" spellCheck={false}/><span className="selector-preview">{readyRows[index]?.computed || "selector pending"}</span></div><button className={row.allowed ? "mode-toggle allow" : "mode-toggle deny"} onClick={() => updateRow(index, { allowed: !row.allowed })} aria-label={`Toggle ${row.allowed ? "allowed" : "denied"} mode`}><span/>{row.allowed ? "Allow" : "Deny"}</button><button className="icon-button remove-row" aria-label="Remove permission row" disabled={draft.rows.length === 1} onClick={() => setField("rows", draft.rows.filter((_, i) => i !== index))}><X size={15}/></button></div>)}</div><button className="add-row" onClick={() => setField("rows", [...draft.rows, EMPTY_ROW()])}><Plus size={15}/> Add permission row</button></div>
            <div className="form-section last"><div className="section-title"><span className="step">03</span><div><h2>Commitment details</h2><p>Exact values included in the immutable deployed record.</p></div></div><label className="field"><span>Mandate digest <em>32-byte commitment</em></span><input className="mono" value={draft.digest} onChange={(e) => setField("digest", e.target.value)} placeholder="0x + 64 hex characters" spellCheck={false}/>{draft.digest && !isHex(draft.digest, { size: 32 }) && <small className="field-error">Digest must be exactly 32 bytes.</small>}</label><label className="field"><span>Expires at</span><input type="datetime-local" value={draft.expires} onChange={(e) => setField("expires", e.target.value)}/>{deadline && deadline.getTime() <= Date.now() && <small className="field-error">Expiry must be in the future.</small>}</label><div className="callout"><LockKeyhole size={15}/><p>New drafts stay on this device. The deployed proof contract is immutable and does not accept new parameters or grant wallet execution rights.</p></div></div>
          </section><aside className="summary-panel"><div className="summary-head"><div><span className="panel-kicker">LIVE SUMMARY</span><h2>Permission boundary</h2></div><span className="draft-badge"><span/>Local draft</span></div><p className="summary-copy">This proposal would identify one principal, commit to a digest until an exact expiry, and name selectors for review.</p><div className="summary-list"><div className="summary-line"><span>Principal</span><strong className="mono">{isAddress(draft.principal) ? short(draft.principal) : "Not set"}</strong></div><div className="summary-line"><span>Agent label</span><strong>{draft.agent || "Not named"}</strong></div><div className="summary-line"><span>Expiry</span><strong className={expiring ? "expiry-warning" : ""}>{deadline && !Number.isNaN(deadline.getTime()) ? fmtTime(Math.floor(deadline.getTime() / 1000)) : "Not set"}{expiring && <CircleAlert size={13}/>}</strong></div><div className="summary-line"><span>Digest</span><strong className="mono">{draft.digest && isHex(draft.digest, { size: 32 }) ? short(draft.digest, 10, 6) : "Not set"}</strong></div></div><div className="summary-permissions"><div className="summary-subhead"><span>CALL SELECTORS</span><span>{readyRows.filter((r) => r.computed).length}</span></div>{readyRows.map((r, i) => <div className="summary-permission" key={i}><span className={r.allowed ? "status-allow" : "status-deny"}>{r.allowed ? <Check size={13}/> : <X size={13}/>}</span><code>{r.computed || "selector pending"}</code><span>{r.allowed ? "Allow" : "Deny"}</span></div>)}</div><img className="sheet-asset" src="/permission-sheet.svg" alt="Illustrated permission rows with explicit allow and deny states"/><div className="boundary-note"><ShieldCheck size={16}/><p>A proof transaction emits an on-chain record. It does not prove the underlying action happened or make the proposed permissions enforceable.</p></div><button className="button primary wide" onClick={saveDraft} disabled={!canSave}><Check size={15}/> Save local draft</button></aside></div>
        </>}
    {tab === "inspect" && <><div className="page-heading"><div><h1>Inspect the deployed record</h1><p>Public read-back from BOT Chain Testnet. Wallet connection is not required.</p></div><button className="button primary" onClick={readInspect} disabled={snapshotState === "loading"}><RefreshCw size={15} className={snapshotState === "loading" ? "spin" : ""}/> {snapshotState === "loading" ? "Reading…" : "Refresh reads"}</button></div><div className="contract-strip"><span className="network-line"><span className="signal-dot"/>BOT Chain Testnet · 968</span><a className="mono contract-address" href={CONTRACT_ADDRESS ? `https://scan.bohr.life/address/${CONTRACT_ADDRESS}` : undefined} target="_blank" rel="noreferrer">{CONTRACT_ADDRESS ?? "Contract address not configured"}<ExternalLink size={13}/></a></div>{snapshotState === "error" && <div className="state-message error"><CircleAlert size={17}/><span>{snapshotError}</span><button onClick={readInspect}>Retry</button></div>}{snapshotState === "idle" && <div className="empty-state"><Fingerprint size={24}/><h2>Read the immutable values</h2><p>Query chain ID, block number, bytecode, principal, digest and expiry from the deployed contract.</p><button className="button primary" onClick={readInspect}><Radio size={15}/> Read contract</button></div>}{snapshot && <div className="inspect-layout"><section className="inspect-values"><div className="section-title"><span className="step">READ</span><div><h2>Immutable contract values</h2><p>Observed at block <code>{snapshot.blockNumber.toString()}</code></p></div></div><div className="value-table"><div className="value-row"><span>Principal</span><code>{snapshot.principal}</code><CopyButton value={snapshot.principal}/></div><div className="value-row"><span>Mandate digest</span><code>{snapshot.digest}</code><CopyButton value={snapshot.digest}/></div><div className="value-row"><span>Expiry</span><code>{fmtTime(snapshot.expiresAt)}</code><span className={snapshot.expiresAt < BigInt(Math.floor(Date.now() / 1000)) ? "tag expired" : "tag valid"}>{snapshot.expiresAt < BigInt(Math.floor(Date.now() / 1000)) ? "Expired" : "Not expired"}</span></div><div className="value-row"><span>Bytecode</span><code>{snapshot.bytecode.length / 2 - 1} bytes · {short(snapshot.bytecode, 12, 8)}</code><span className="tag valid">Present</span></div></div><div className="explorer-callout"><ExternalLink size={15}/><span>Read the verified source and contract activity on the explorer.</span><a href={`https://scan.bohr.life/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">Open BOT Scan</a></div></section><section className="selector-check"><div className="section-title"><span className="step">CALL</span><div><h2>Check a selector</h2><p>Read the contract’s immutable boolean allowlist.</p></div></div><SelectorCheck account={account} walletChain={walletChain} onRecord={recordProof} busy={busy}/></section></div>}</>}
        {tab === "receipts" && <><div className="page-heading"><div><h1>Proof receipts</h1><p>Events emitted by <code>prove(bytes4)</code> on the deployed proof contract.</p></div><button className="button primary" onClick={readReceipts} disabled={receiptState === "loading"}><RefreshCw size={15} className={receiptState === "loading" ? "spin" : ""}/>{receiptState === "loading" ? "Reading…" : "Refresh receipts"}</button></div><div className="receipt-explainer"><FileCheck2 size={17}/><p>Each receipt confirms that the contract accepted an allowed selector and emitted an event. It is not evidence that the corresponding business call was executed.</p></div>{receiptState === "error" && <div className="state-message error"><CircleAlert size={17}/>{receiptError}<button onClick={readReceipts}>Retry</button></div>}{receiptState === "idle" && <div className="empty-state"><Clock3 size={24}/><h2>No receipt query yet</h2><p>Publicly read emitted proof events from the deployed contract.</p><button className="button primary" onClick={readReceipts}><Radio size={15}/> Load receipts</button></div>}{receiptState === "ready" && (receipts.length ? <div className="receipt-list"><div className="receipt-table-head"><span>SELECTOR</span><span>DIGEST</span><span>CALLER</span><span>BLOCK</span><span/></div>{receipts.map((r) => <div className="receipt-row" key={`${r.hash}-${r.selector}`}><code>{r.selector}</code><code>{short(r.digest, 10, 6)}</code><code>{short(r.caller)}</code><code>{r.blockNumber.toString()}</code><a href={`https://scan.bohr.life/tx/${r.hash}`} target="_blank" rel="noreferrer" aria-label="Open transaction"><ExternalLink size={15}/></a></div>)}</div> : <div className="empty-state compact"><FileCheck2 size={22}/><h2>No proof receipts found</h2><p>The contract has not emitted a matching event, or the RPC did not return historical logs.</p></div>)}</>}
        <footer className="page-footer"><span>Mandate · BOT Chain Testnet</span><span className="mono">PUBLIC READS · EXPLICIT WRITES</span><a href="https://github.com/nftkingiii/botchain-mandate" target="_blank" rel="noreferrer">Contract source <ArrowUpRight size={13}/></a></footer>
      </div>
    </main>
    {notice && <div role="status" className="toast"><Check size={15}/>{notice}</div>}
    {tab === "draft" && <div className="draft-dock"><button className="dock-new" aria-label="Start a new draft" onClick={() => setDraft(EMPTY_DRAFT())}><Plus size={16}/></button><div className="dock-label">RECENT DRAFTS <span>{drafts.length}</span></div>{drafts.slice(0, 3).map((saved) => <button className="dock-item" key={saved.id} onClick={() => loadDraft(saved)}><span className="dock-mark"/><span>{saved.agent || short(saved.principal || "Untitled", 9, 3)}</span><small>{new Date(saved.updated).toLocaleDateString()}</small></button>)}</div>}
    {txState && <div className="status-toast" role="status"><span>{busy ? <LoaderCircle size={16} className="spin"/> : <CircleAlert size={16}/>}</span><p>{txState}</p><button aria-label="Dismiss message" onClick={() => setTxState("")}><X size={15}/></button></div>}
    <div className="mobile-tabs" aria-label="Workflows">{([ ["draft", FilePlus2, "Draft"], ["inspect", Fingerprint, "Inspect"], ["receipts", FileCheck2, "Receipts"] ] as const).map(([id, Icon, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => navigate(id)}><Icon size={18}/><span>{label}</span></button>)}</div>
    {tab === "draft" && <div className="mobile-review"><button onClick={() => document.querySelector(".summary-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Review permission <ChevronDown size={15}/></button></div>}
  </div>;
}

function CopyButton({ value }: { value: string }) { const [copied, setCopied] = useState(false); return <button className="icon-button copy-button" aria-label="Copy value" onClick={() => { void navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>{copied ? <Check size={14}/> : <Copy size={14}/>}</button>; }

function SelectorCheck({ account, walletChain, onRecord, busy }: { account: string | null; walletChain: number | null; onRecord: (selector: string) => Promise<void>; busy: boolean }) {
  const [selector, setSelector] = useState(""); const [result, setResult] = useState<boolean | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  return <div className="selector-form"><label className="field"><span>4-byte selector</span><input className="mono" value={selector} onChange={(e) => { setSelector(e.target.value); setResult(null); }} placeholder="0x12345678"/></label><button className="button subtle" disabled={!isHex(selector, { size: 4 }) || loading} onClick={async () => { setLoading(true); setError(""); setResult(null); try { setResult(await isSelectorAllowed(selector as `0x${string}`)); } catch (e) { setError(e instanceof Error ? e.message : "Read failed"); } finally { setLoading(false); } }}>{loading ? "Checking…" : "Check allowlist"}</button>{result !== null && <div className={result ? "selector-result allowed" : "selector-result denied"}><span>{result ? <Check size={14}/> : <X size={14}/>}</span>{result ? "Selector is allowed by the deployed contract." : "Selector is not allowed by the deployed contract."}</div>}{result && <><p className="warning-note">Any address can call <code>prove(bytes4)</code>. This emits proof metadata only; it does not execute the named operation.</p><button className="button primary" disabled={!account || walletChain !== 968 || busy} onClick={() => void onRecord(selector)}><Fingerprint size={15}/>{!account ? "Connect wallet to record" : walletChain !== 968 ? "Switch wallet to Testnet" : busy ? "Waiting for wallet…" : "Record proof event"}</button></>}{error && <small className="field-error">{error}</small>}</div>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App/></React.StrictMode>);
