export type ChildMode = "freeze" | "kill" | "inject";
export type AppFilter = "user" | "system" | "all";
export type TargetFilter = "all" | "enabled" | "disabled";
export type Tab = "targets" | "gadget";
export type GadgetJsonStatus = "ok" | "missing" | "invalid";

export interface InjectedLibrary {
  path: string;
}

export interface ChildGating {
  enabled: boolean;
  mode: ChildMode;
  injected_libraries: InjectedLibrary[];
}

export interface Target {
  app_name: string;
  enabled: boolean;
  kernel_assisted_evasion: boolean;
  start_up_delay_ms: number;
  injected_libraries: InjectedLibrary[];
  child_gating: ChildGating;
}

export interface AppConfig {
  targets: Target[];
}
