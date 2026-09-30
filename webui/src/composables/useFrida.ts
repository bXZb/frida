import { computed, nextTick, reactive, ref, watch } from "vue";
import {
  CONFIG_PATH,
  DEFAULT_GADGET_CONFIG,
  DEMO_PACKAGE,
  GADGET_BIN_PATH,
  GADGET_CONFIG_PATH,
  GADGET_DIR,
  defaultLibs,
} from "../constants";
import { exec, getPackagesInfo, listPackages, shellQuote, toast } from "../ksu";
import type {
  AppConfig,
  AppFilter,
  ChildGating,
  GadgetJsonStatus,
  Tab,
  Target,
  TargetFilter,
} from "../types";

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 4);
}

function parseGadgetJson(raw: string): object {
  const parsed: unknown = JSON.parse(raw);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SyntaxError("Gadget config must be a JSON object");
  }
  return parsed;
}

function emptyChild(): ChildGating {
  return { enabled: false, mode: "freeze", injected_libraries: [] };
}

function normalizeTarget(raw: Partial<Target>): Target | null {
  if (!raw.app_name) return null;
  return {
    app_name: raw.app_name,
    enabled: raw.enabled !== false,
    kernel_assisted_evasion: Boolean(raw.kernel_assisted_evasion),
    start_up_delay_ms: Number(raw.start_up_delay_ms) || 0,
    injected_libraries: Array.isArray(raw.injected_libraries) ? raw.injected_libraries : defaultLibs(),
    child_gating: {
      enabled: Boolean(raw.child_gating?.enabled),
      mode: raw.child_gating?.mode === "kill" || raw.child_gating?.mode === "inject"
        ? raw.child_gating.mode
        : "freeze",
      injected_libraries: Array.isArray(raw.child_gating?.injected_libraries)
        ? raw.child_gating.injected_libraries
        : [],
    },
  };
}

function stripDemo(cfg: AppConfig): AppConfig {
  return {
    targets: (cfg.targets || []).filter((t) => t.app_name && t.app_name !== DEMO_PACKAGE),
  };
}

export function useFrida() {
  const tab = ref<Tab>("targets");
  const config = reactive<AppConfig>({ targets: [] });
  const labels = reactive<Record<string, string>>({});
  const expanded = reactive<Record<string, boolean>>({});
  const appFilter = ref<AppFilter>("user");
  const apps = ref<string[]>([]);
  const packageCache = reactive<Record<AppFilter, string[]>>({
    user: [],
    system: [],
    all: [],
  });
  const fetchingApps = ref(false);
  const pickerOpen = ref(false);
  const pickerQuery = ref("");
  let pendingAppFetch: AppFilter | null = null;

  const gadgetInstalled = ref(false);
  const gadgetDetail = ref("Checking…");
  const gadgetJson = ref(prettyJson(DEFAULT_GADGET_CONFIG));
  const gadgetJsonStatus = ref<GadgetJsonStatus>("missing");
  const gadgetJsonError = computed<string | null>(() => {
    try {
      parseGadgetJson(gadgetJson.value);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  });
  const gadgetPath = ref("");
  const gadgetScan = ref<string[]>([]);
  const scanning = ref(false);
  const installing = ref(false);
  const clearLibsOnGadgetChange = ref(false);
  const busy = ref(false);
  const dirty = ref(false);
  const targetFilter = ref<TargetFilter>("all");
  let suppressDirty = false;

  watch(config, () => {
    if (!suppressDirty) dirty.value = true;
  }, { deep: true });

  function resetDirty(): void {
    suppressDirty = true;
    dirty.value = false;
    void nextTick(() => {
      suppressDirty = false;
    });
  }

  const filteredApps = computed(() => {
    const q = pickerQuery.value.trim().toLowerCase();
    return apps.value.filter((pkg) => {
      const label = (labels[pkg] || "").toLowerCase();
      return !q || pkg.toLowerCase().includes(q) || label.includes(q);
    });
  });

  const filteredTargets = computed(() =>
    config.targets.filter((t) =>
      targetFilter.value === "all"
        ? true
        : targetFilter.value === "enabled"
          ? t.enabled
          : !t.enabled,
    ),
  );

  const addedSet = computed(() => new Set(config.targets.map((t) => t.app_name)));

  function labelOf(pkg: string): string {
    return labels[pkg] || pkg;
  }

  async function writeConfig(): Promise<boolean> {
    const json = prettyJson(config);
    const r = await exec(`echo ${shellQuote(json)} > ${CONFIG_PATH} && chmod 644 ${CONFIG_PATH}`);
    return r.errno === 0;
  }

  async function loadConfig(): Promise<void> {
    const r = await exec(`cat ${CONFIG_PATH}`);
    let stripped = false;
    if (r.errno === 0 && r.stdout.trim()) {
      try {
        const parsed = JSON.parse(r.stdout) as AppConfig;
        const before = Array.isArray(parsed.targets) ? parsed.targets.length : 0;
        const next = stripDemo({
          targets: (parsed.targets || []).map(normalizeTarget).filter((t): t is Target => t !== null),
        });
        stripped = before !== next.targets.length;
        config.targets = next.targets;
      } catch (e) {
        toast(`Config parse error: ${e instanceof Error ? e.message : String(e)}`);
        config.targets = [];
      }
    } else {
      config.targets = [];
    }
    if (stripped) await writeConfig();
    resetDirty();
  }

  async function saveConfig(): Promise<void> {
    if (await writeConfig()) {
      resetDirty();
      toast("Config saved");
    } else {
      toast("Save failed");
    }
  }

  async function loadGadgetConfig(): Promise<void> {
    const r = await exec(`cat ${GADGET_CONFIG_PATH}`);
    if (r.errno !== 0) {
      gadgetJsonStatus.value = "missing";
      gadgetJson.value = prettyJson(DEFAULT_GADGET_CONFIG);
      return;
    }
    try {
      gadgetJson.value = prettyJson(parseGadgetJson(r.stdout));
      gadgetJsonStatus.value = "ok";
    } catch (e) {
      gadgetJson.value = r.stdout;
      gadgetJsonStatus.value = "invalid";
      toast(`Gadget config parse error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function formatGadgetJson(): void {
    try {
      gadgetJson.value = prettyJson(parseGadgetJson(gadgetJson.value));
    } catch {
      /* invalid — Save will surface the error */
    }
  }

  async function saveGadgetConfig(): Promise<boolean> {
    let pretty: string;
    try {
      pretty = prettyJson(parseGadgetJson(gadgetJson.value));
    } catch (e) {
      gadgetJsonStatus.value = "invalid";
      toast.error(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
    gadgetJson.value = pretty;
    const r = await exec(`echo ${shellQuote(pretty)} > ${GADGET_CONFIG_PATH} && chmod 644 ${GADGET_CONFIG_PATH}`);
    if (r.errno === 0) {
      gadgetJsonStatus.value = "ok";
      toast.success("Gadget config saved");
      return true;
    }
    gadgetJsonStatus.value = "invalid";
    toast.error(`Failed: ${r.stderr}`);
    return false;
  }

  async function refreshGadgetBinary(): Promise<void> {
    const r = await exec(
      `if [ -f ${GADGET_BIN_PATH} ]; then stat -c '%s %y' ${GADGET_BIN_PATH} 2>/dev/null || ls -l ${GADGET_BIN_PATH}; else echo MISSING; fi`,
    );
    const text = (r.stdout || "").trim();
    gadgetInstalled.value = r.errno === 0 && text.length > 0 && !text.startsWith("MISSING");
    gadgetDetail.value = gadgetInstalled.value
      ? `${GADGET_BIN_PATH}  (${text})`
      : `No gadget at ${GADGET_BIN_PATH}`;
  }

  function clearAllInjectedLibraries(): void {
    for (const t of config.targets) {
      t.injected_libraries = [];
      if (t.child_gating) t.child_gating.injected_libraries = [];
    }
  }

  async function maybeClearLibraries(): Promise<void> {
    if (!clearLibsOnGadgetChange.value) return;
    clearAllInjectedLibraries();
    await saveConfig();
  }

  async function installGadget(): Promise<void> {
    const src = gadgetPath.value.trim();
    if (!src) {
      toast("Pick or enter a .so path first");
      return;
    }
    if (src.includes("\n") || src.includes(";")) {
      toast("Invalid path");
      return;
    }
    installing.value = true;
    const cmd =
      "set -e; " +
      `SRC=${shellQuote(src)}; ` +
      `DST=${shellQuote(GADGET_BIN_PATH)}; ` +
      `DIR=${shellQuote(GADGET_DIR)}; ` +
      'mkdir -p "$DIR"; ' +
      'if [ ! -f "$SRC" ]; then echo \'source not found\' >&2; exit 2; fi; ' +
      'case "$SRC" in ' +
      "  *.xz) " +
      "    UNXZ=''; " +
      "    for c in /data/adb/ksu/bin/busybox /data/adb/magisk/busybox /data/adb/ap/bin/busybox busybox unxz xz; do " +
      '      [ -x "$c" ] || command -v "$c" >/dev/null 2>&1 || continue; ' +
      '      UNXZ="$c"; break; ' +
      "    done; " +
      '    if [ -z "$UNXZ" ]; then echo \'no unxz/busybox found\' >&2; exit 3; fi; ' +
      '    if [ "$UNXZ" = xz ]; then xz -dc "$SRC" > "$DST"; ' +
      '    elif [ "$UNXZ" = unxz ]; then unxz -c "$SRC" > "$DST"; ' +
      '    else "$UNXZ" unxz -c "$SRC" > "$DST"; fi; ' +
      "    ;; " +
      '  *) cp -f "$SRC" "$DST" ;; ' +
      "esac; " +
      'chmod 644 "$DST"; ' +
      'HDR=$(od -An -N4 -tx1 "$DST" 2>/dev/null | tr -d \' \\n\'); ' +
      'if [ "$HDR" != "7f454c46" ]; then echo \'not an ELF .so\' >&2; rm -f "$DST"; exit 4; fi; ' +
      "echo OK";
    const r = await exec(cmd);
    installing.value = false;
    if (r.errno === 0 && (r.stdout || "").includes("OK")) {
      toast.success("Gadget installed");
      await maybeClearLibraries();
    } else {
      toast.error(`Install failed: ${(r.stderr || r.stdout || "unknown").trim()}`);
    }
    await refreshGadgetBinary();
  }

  async function removeGadget(): Promise<void> {
    const r = await exec(`rm -f ${GADGET_BIN_PATH}`);
    if (r.errno === 0) {
      toast.success("Gadget removed");
      await maybeClearLibraries();
    } else {
      toast.error(`Remove failed: ${r.stderr}`);
    }
    await refreshGadgetBinary();
  }

  async function scanGadgetCandidates(): Promise<void> {
    scanning.value = true;
    gadgetScan.value = [];
    const r = await exec(
      "find /sdcard/Download /sdcard/Downloads /storage/emulated/0/Download " +
        "/data/local/tmp /sdcard -maxdepth 3 -type f " +
        "\\( -name '*.so' -o -name '*.so.xz' \\) 2>/dev/null | head -n 80",
    );
    scanning.value = false;
    gadgetScan.value = (r.stdout || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (gadgetScan.value.length === 0) toast("No .so files found under Download or /data/local/tmp");
  }

  function loadPackageLabels(names: string[]): void {
    if (names.length === 0) return;
    for (const info of getPackagesInfo(names)) {
      if (info.appLabel && info.appLabel !== info.packageName) {
        labels[info.packageName] = info.appLabel;
      }
    }
  }

  async function fetchApps(type: AppFilter = appFilter.value): Promise<void> {
    if (fetchingApps.value) {
      pendingAppFetch = type;
      return;
    }
    fetchingApps.value = true;
    try {
      let requested: AppFilter | null = type;
      while (requested) {
        const current = requested;
        pendingAppFetch = null;
        const pkgs = listPackages(current);
        loadPackageLabels(pkgs);
        pkgs.sort((a, b) => (labels[a] || a).localeCompare(labels[b] || b, undefined, { sensitivity: "base" }));
        packageCache[current] = pkgs;
        if (appFilter.value === current) apps.value = pkgs;
        requested = pendingAppFetch;
      }
    } finally {
      fetchingApps.value = false;
    }
  }

  function setAppFilter(type: AppFilter): void {
    appFilter.value = type;
    if (packageCache[type]?.length) {
      apps.value = packageCache[type];
      return;
    }
    apps.value = [];
    void fetchApps(type);
  }

  function openPicker(): void {
    pickerOpen.value = true;
    pickerQuery.value = "";
    if (!apps.value.length && !fetchingApps.value) void fetchApps(appFilter.value);
  }

  function addTarget(pkg: string): void {
    if (addedSet.value.has(pkg)) {
      toast("Already added");
      return;
    }
    config.targets.push({
      app_name: pkg,
      enabled: true,
      kernel_assisted_evasion: false,
      start_up_delay_ms: 0,
      injected_libraries: defaultLibs(),
      child_gating: emptyChild(),
    });
    toast.success(`Added ${labels[pkg] || pkg}`);
  }

  function removeTarget(pkg: string): void {
    const index = config.targets.findIndex((t) => t.app_name === pkg);
    if (index === -1) return;
    config.targets.splice(index, 1);
    delete expanded[pkg];
  }

  function toggleExpand(pkg: string): void {
    expanded[pkg] = !expanded[pkg];
  }

  async function saveAll(): Promise<void> {
    busy.value = true;
    await saveConfig();
    await saveGadgetConfig();
    busy.value = false;
  }

  async function reload(): Promise<void> {
    busy.value = true;
    packageCache.user = [];
    packageCache.system = [];
    packageCache.all = [];
    await Promise.all([loadConfig(), loadGadgetConfig(), refreshGadgetBinary(), fetchApps(appFilter.value)]);
    busy.value = false;
  }

  async function boot(): Promise<void> {
    await Promise.all([loadConfig(), loadGadgetConfig(), refreshGadgetBinary(), fetchApps("user")]);
  }

  return {
    tab,
    config,
    labels,
    expanded,
    appFilter,
    apps,
    fetchingApps,
    pickerOpen,
    pickerQuery,
    filteredApps,
    dirty,
    targetFilter,
    filteredTargets,
    addedSet,
    gadgetInstalled,
    gadgetDetail,
    gadgetJson,
    gadgetJsonStatus,
    gadgetJsonError,
    formatGadgetJson,
    gadgetPath,
    gadgetScan,
    scanning,
    installing,
    clearLibsOnGadgetChange,
    busy,
    labelOf,
    saveAll,
    reload,
    boot,
    installGadget,
    removeGadget,
    scanGadgetCandidates,
    setAppFilter,
    openPicker,
    addTarget,
    removeTarget,
    toggleExpand,
    fetchApps,
  };
}
