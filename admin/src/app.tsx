import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  BadgeCheck,
  Cable,
  KeyRound,
  LogOut,
  PencilRuler,
  Plus,
  Save,
  Shield,
  Trash2,
} from "lucide-react";
import { fetchConfig, logout, saveConfig } from "./lib/api";
import type { DeleteRule, EditableConfigPayload, ProxyChainEntry, RenameRule } from "./lib/types";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { ScrollArea } from "./components/ui/scroll-area";
import { Separator } from "./components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Textarea } from "./components/ui/textarea";

const EMPTY_CONFIG: EditableConfigPayload = {
  rules: [],
  proxyChain: [],
  renameRules: [],
  deleteRules: [],
  headers: {},
  accessToken: "",
};

type SaveState =
  | { tone: "idle"; message: string }
  | { tone: "success"; message: string }
  | { tone: "error"; message: string };

function createEmptyProxyChain(): ProxyChainEntry {
  return { target: "", dialer: "" };
}

function createEmptyRenameRule(): RenameRule {
  return { pattern: "", replacement: "", flags: "" };
}

function createEmptyDeleteRule(): DeleteRule {
  return { pattern: "", flags: "" };
}

function objectEntries(headers: Record<string, string>): Array<{ key: string; value: string }> {
  return Object.entries(headers).map(([key, value]) => ({ key, value }));
}

function toHeaderRecord(rows: Array<{ key: string; value: string }>): Record<string, string> {
  return Object.fromEntries(
    rows
      .map((row) => ({ key: row.key.trim(), value: row.value.trim() }))
      .filter((row) => row.key && row.value)
      .map((row) => [row.key, row.value]),
  );
}

function normalizeRules(value: string): string[] {
  return value
    .split("\n")
    .map((rule) => rule.trim())
    .filter(Boolean);
}

function useDerivedStatus(config: EditableConfigPayload, initialToken: string): Array<{ label: string; value: string }> {
  return useMemo(
    () => [
      { label: "Rules", value: String(config.rules.length) },
      { label: "Proxy chains", value: String(config.proxyChain.length) },
      { label: "Regex transforms", value: String(config.renameRules.length + config.deleteRules.length) },
      { label: "Headers", value: String(Object.keys(config.headers).length) },
      { label: "Token changed", value: config.accessToken !== initialToken ? "Yes" : "No" },
    ],
    [config, initialToken],
  );
}

export function App(): React.JSX.Element {
  const [config, setConfig] = useState<EditableConfigPayload>(EMPTY_CONFIG);
  const [initialAccessToken, setInitialAccessToken] = useState("");
  const [headerRows, setHeaderRows] = useState<Array<{ key: string; value: string }>>([]);
  const [rulesText, setRulesText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [status, setStatus] = useState<SaveState>({ tone: "idle", message: "KV-backed control room ready." });

  useEffect(() => {
    let active = true;
    fetchConfig()
      .then((nextConfig) => {
        if (!active) return;
        setConfig(nextConfig);
        setInitialAccessToken(nextConfig.accessToken);
        setHeaderRows(objectEntries(nextConfig.headers));
        setRulesText(nextConfig.rules.join("\n"));
      })
      .catch((error) => {
        if (!active) return;
        setStatus({ tone: "error", message: error instanceof Error ? error.message : String(error) });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const metrics = useDerivedStatus(config, initialAccessToken);
  const accessTokenChanged = config.accessToken !== initialAccessToken;

  function patchConfig(patch: Partial<EditableConfigPayload>): void {
    setConfig((current) => ({ ...current, ...patch }));
  }

  function syncHeaders(rows: Array<{ key: string; value: string }>): void {
    setHeaderRows(rows);
    patchConfig({ headers: toHeaderRecord(rows) });
  }

  async function persist(): Promise<void> {
    setSaving(true);
    setStatus({ tone: "idle", message: "Publishing updates to KV..." });

    try {
      const payload: EditableConfigPayload = {
        ...config,
        rules: normalizeRules(rulesText),
        headers: toHeaderRecord(headerRows),
      };
      const result = await saveConfig(payload);
      setConfig(result.config);
      setRulesText(result.config.rules.join("\n"));
      setHeaderRows(objectEntries(result.config.headers));
      setInitialAccessToken(result.config.accessToken);
      setStatus({ tone: "success", message: `Saved at ${new Date(result.savedAt).toLocaleString()}.` });
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  }

  async function handleLogout(): Promise<void> {
    await logout();
    window.location.assign("/");
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="pointer-events-none fixed inset-0 opacity-90">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(228,179,99,0.22),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(76,112,109,0.18),transparent_24%),linear-gradient(180deg,#120f0d_0%,#0b0b0b_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:120px_120px] [mask-image:radial-gradient(circle_at_center,black,transparent_85%)]" />
      </div>

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-8 px-5 py-8 md:px-8 xl:px-10">
        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="overflow-hidden">
            <CardHeader className="gap-5 md:flex-row md:items-end md:justify-between">
              <div className="space-y-4">
                <Badge>Eggtart Control Room</Badge>
                <div className="space-y-3">
                  <CardTitle className="max-w-3xl text-4xl leading-tight md:text-5xl">
                    A secure editing cockpit for the subscription pipeline.
                  </CardTitle>
                  <CardDescription className="max-w-2xl text-base">
                    Adjust transform rules, header overrides, proxy chaining, and the public access token from one guarded
                    console. Every save writes straight to Cloudflare KV.
                  </CardDescription>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" onClick={() => void handleLogout()}>
                  <LogOut className="h-4 w-4" />
                  Logout
                </Button>
                <Button onClick={() => (accessTokenChanged ? setConfirmOpen(true) : void persist())} disabled={saving || loading}>
                  <Save className="h-4 w-4" />
                  {saving ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-5">
              {metrics.map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-[24px] border border-white/8 bg-black/15 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                >
                  <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted-foreground)]">{metric.label}</div>
                  <div className="mt-3 font-serif text-3xl text-[var(--foreground)]">{metric.value}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-3xl">
                <Shield className="h-7 w-7 text-[var(--accent)]" />
                Security posture
              </CardTitle>
              <CardDescription>
                Admin traffic is locked behind a signed cookie session. Subscription access still flows through a dedicated path token.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {status.tone !== "idle" ? (
                <Alert variant={status.tone === "error" ? "destructive" : "default"}>
                  <AlertTitle>{status.tone === "error" ? "Save blocked" : "Configuration synced"}</AlertTitle>
                  <AlertDescription>{status.message}</AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <AlertTitle>Ready for edits</AlertTitle>
                  <AlertDescription>{status.message}</AlertDescription>
                </Alert>
              )}

              <div className="grid gap-3">
                {[
                  { icon: <BadgeCheck className="h-4 w-4" />, title: "Session-backed UI", body: "The React app stays behind a signed HttpOnly cookie after the initial /admin/{token} handshake." },
                  { icon: <KeyRound className="h-4 w-4" />, title: "Access token rotation", body: "You can rotate the public subscription token without touching the admin token stored offline." },
                  { icon: <ArrowRightLeft className="h-4 w-4" />, title: "KV normalization", body: "Arrays and header maps are normalized before being written, reducing broken JSON states." },
                ].map((item) => (
                  <div key={item.title} className="rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-4">
                    <div className="flex items-center gap-3 text-sm font-semibold text-[var(--foreground)]">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(228,179,99,0.14)] text-[var(--accent)]">
                        {item.icon}
                      </span>
                      {item.title}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{item.body}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <Card className="overflow-hidden">
          <CardHeader className="pb-4">
            <CardTitle className="text-3xl">Editable config surface</CardTitle>
            <CardDescription>
              Each panel maps directly to one KV structure used by the Worker transform chain. Empty rows are ignored on save.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex min-h-[360px] items-center justify-center text-sm uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
                Loading control room...
              </div>
            ) : (
              <Tabs defaultValue="rules">
                <TabsList>
                  <TabsTrigger value="rules">Rules</TabsTrigger>
                  <TabsTrigger value="proxy">Proxy Chain</TabsTrigger>
                  <TabsTrigger value="rename">Rename Rules</TabsTrigger>
                  <TabsTrigger value="delete">Delete Rules</TabsTrigger>
                  <TabsTrigger value="headers">Headers</TabsTrigger>
                  <TabsTrigger value="token">Access Token</TabsTrigger>
                </TabsList>

                <TabsContent value="rules">
                  <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                    <Card className="border-white/8 bg-black/10">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-3 text-2xl">
                          <PencilRuler className="h-5 w-5 text-[var(--accent)]" />
                          Clash rules
                        </CardTitle>
                        <CardDescription>One rule per line. The Worker appends these to the upstream Clash YAML.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Textarea
                          value={rulesText}
                          onChange={(event) => {
                            const next = event.target.value;
                            setRulesText(next);
                            patchConfig({ rules: normalizeRules(next) });
                          }}
                          placeholder="DOMAIN-SUFFIX,github.com,Proxy"
                          className="min-h-[420px] font-mono text-[13px]"
                        />
                      </CardContent>
                    </Card>

                    <Card className="border-white/8 bg-black/10">
                      <CardHeader>
                        <CardTitle className="text-2xl">Editing notes</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 text-sm leading-7 text-[var(--muted-foreground)]">
                        <p>Use this panel for raw Clash rule lines only. The system preserves order exactly as shown after trimming blank lines.</p>
                        <Separator />
                        <p>Typical examples include policy routing, suffix routing, and final `MATCH` fallbacks. The save button writes the normalized array to the KV key `rules`.</p>
                        <Separator />
                        <p>The public subscription endpoint starts using new rules on the very next request. There is no delayed publish step.</p>
                      </CardContent>
                    </Card>
                  </section>
                </TabsContent>

                <TabsContent value="proxy">
                  <EditorTableCard
                    icon={<Cable className="h-5 w-5 text-[var(--accent)]" />}
                    title="Proxy chain"
                    description="Assign dialer proxies to specific target nodes."
                    addLabel="Add chain rule"
                    onAdd={() => patchConfig({ proxyChain: [...config.proxyChain, createEmptyProxyChain()] })}
                  >
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Target proxy</TableHead>
                          <TableHead>Dialer proxy</TableHead>
                          <TableHead className="w-[88px]" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {config.proxyChain.map((row, index) => (
                          <TableRow key={`proxy-${index}`}>
                            <TableCell>
                              <Input
                                value={row.target}
                                onChange={(event) =>
                                  patchConfig({
                                    proxyChain: config.proxyChain.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, target: event.target.value } : item,
                                    ),
                                  })
                                }
                                placeholder="HK-A"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={row.dialer}
                                onChange={(event) =>
                                  patchConfig({
                                    proxyChain: config.proxyChain.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, dialer: event.target.value } : item,
                                    ),
                                  })
                                }
                                placeholder="Chain-Node"
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => patchConfig({ proxyChain: config.proxyChain.filter((_, itemIndex) => itemIndex !== index) })}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </EditorTableCard>
                </TabsContent>

                <TabsContent value="rename">
                  <EditorTableCard
                    icon={<ArrowRightLeft className="h-5 w-5 text-[var(--accent)]" />}
                    title="Rename rules"
                    description="Regex-based node renaming applied before delete and chain stages."
                    addLabel="Add rename rule"
                    onAdd={() => patchConfig({ renameRules: [...config.renameRules, createEmptyRenameRule()] })}
                  >
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Pattern</TableHead>
                          <TableHead>Replacement</TableHead>
                          <TableHead>Flags</TableHead>
                          <TableHead className="w-[88px]" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {config.renameRules.map((row, index) => (
                          <TableRow key={`rename-${index}`}>
                            <TableCell>
                              <Input
                                value={row.pattern}
                                onChange={(event) =>
                                  patchConfig({
                                    renameRules: config.renameRules.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, pattern: event.target.value } : item,
                                    ),
                                  })
                                }
                                placeholder="^HK-"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={row.replacement}
                                onChange={(event) =>
                                  patchConfig({
                                    renameRules: config.renameRules.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, replacement: event.target.value } : item,
                                    ),
                                  })
                                }
                                placeholder="HKG-"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={row.flags}
                                onChange={(event) =>
                                  patchConfig({
                                    renameRules: config.renameRules.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, flags: event.target.value } : item,
                                    ),
                                  })
                                }
                                placeholder="gi"
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => patchConfig({ renameRules: config.renameRules.filter((_, itemIndex) => itemIndex !== index) })}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </EditorTableCard>
                </TabsContent>

                <TabsContent value="delete">
                  <EditorTableCard
                    icon={<Trash2 className="h-5 w-5 text-[var(--accent)]" />}
                    title="Delete rules"
                    description="Regex filters applied to proxy names after rename processing."
                    addLabel="Add delete rule"
                    onAdd={() => patchConfig({ deleteRules: [...config.deleteRules, createEmptyDeleteRule()] })}
                  >
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Pattern</TableHead>
                          <TableHead>Flags</TableHead>
                          <TableHead className="w-[88px]" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {config.deleteRules.map((row, index) => (
                          <TableRow key={`delete-${index}`}>
                            <TableCell>
                              <Input
                                value={row.pattern}
                                onChange={(event) =>
                                  patchConfig({
                                    deleteRules: config.deleteRules.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, pattern: event.target.value } : item,
                                    ),
                                  })
                                }
                                placeholder="^TEST"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={row.flags}
                                onChange={(event) =>
                                  patchConfig({
                                    deleteRules: config.deleteRules.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, flags: event.target.value } : item,
                                    ),
                                  })
                                }
                                placeholder="i"
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => patchConfig({ deleteRules: config.deleteRules.filter((_, itemIndex) => itemIndex !== index) })}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </EditorTableCard>
                </TabsContent>

                <TabsContent value="headers">
                  <EditorTableCard
                    icon={<BadgeCheck className="h-5 w-5 text-[var(--accent)]" />}
                    title="Subscribe request headers"
                    description="Additional headers sent when requesting the final subscribe URL. User-Agent may override the default Clash UA."
                    addLabel="Add header"
                    onAdd={() => syncHeaders([...headerRows, { key: "", value: "" }])}
                  >
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Header name</TableHead>
                          <TableHead>Header value</TableHead>
                          <TableHead className="w-[88px]" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {headerRows.map((row, index) => (
                          <TableRow key={`header-${index}`}>
                            <TableCell>
                              <Input
                                value={row.key}
                                onChange={(event) =>
                                  syncHeaders(
                                    headerRows.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, key: event.target.value } : item,
                                    ),
                                  )
                                }
                                placeholder="User-Agent"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={row.value}
                                onChange={(event) =>
                                  syncHeaders(
                                    headerRows.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, value: event.target.value } : item,
                                    ),
                                  )
                                }
                                placeholder="clash-verge"
                              />
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" onClick={() => syncHeaders(headerRows.filter((_, itemIndex) => itemIndex !== index))}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </EditorTableCard>
                </TabsContent>

                <TabsContent value="token">
                  <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
                    <Card className="border-white/8 bg-black/10">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-3 text-2xl">
                          <KeyRound className="h-5 w-5 text-[var(--accent)]" />
                          Public access token
                        </CardTitle>
                        <CardDescription>Rotate the token used by `/sub/{'{accessToken}'}`. This does not affect the admin token.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <Input
                          value={config.accessToken}
                          onChange={(event) => patchConfig({ accessToken: event.target.value })}
                          placeholder="new-public-token"
                          className="font-mono"
                        />
                        <Alert>
                          <AlertTitle>Rotation behavior</AlertTitle>
                          <AlertDescription>
                            Saving this field immediately invalidates the previous subscription link. The admin console session remains active because it is cookie-based.
                          </AlertDescription>
                        </Alert>
                      </CardContent>
                    </Card>

                    <Card className="border-white/8 bg-black/10">
                      <CardHeader>
                        <CardTitle className="text-2xl">Guardrails</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 text-sm leading-7 text-[var(--muted-foreground)]">
                        <p>The admin token is intentionally not editable here. That prevents accidental lockouts and keeps the bootstrap secret managed offline.</p>
                        <Separator />
                        <p>If you change the public token, the save flow shows a confirmation dialog before writing to KV.</p>
                        <Separator />
                        <p>Use a high-entropy token because it acts as a bearer credential for the YAML subscription endpoint.</p>
                      </CardContent>
                    </Card>
                  </section>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rotate the public token?</DialogTitle>
            <DialogDescription>
              Existing subscription URLs will stop working as soon as this save completes. The admin session cookie will remain valid.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void persist()} disabled={saving}>
              {saving ? "Saving..." : "Confirm and save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditorTableCard({
  icon,
  title,
  description,
  addLabel,
  onAdd,
  children,
}: {
  icon: React.JSX.Element;
  title: string;
  description: string;
  addLabel: string;
  onAdd: () => void;
  children: React.JSX.Element;
}): React.JSX.Element {
  return (
    <Card className="border-white/8 bg-black/10">
      <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <CardTitle className="flex items-center gap-3 text-2xl">
            {icon}
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button variant="secondary" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          {addLabel}
        </Button>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[520px] rounded-[24px] border border-white/8 bg-black/10">
          <div className="p-2">{children}</div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
