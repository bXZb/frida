export const CONFIG_PATH = "/data/local/tmp/libsec/config.json";
export const GADGET_CONFIG_PATH = "/data/local/tmp/libsec/libsecmon.config.so";
export const GADGET_BIN_PATH = "/data/local/tmp/libsec/libsecmon.so";
export const GADGET_DIR = "/data/local/tmp/libsec";
export const DEMO_PACKAGE = "com.example.package";

export const DEFAULT_GADGET_CONFIG = {
  interaction: {
    type: "listen",
    address: "0.0.0.0",
    port: 27042,
    on_load: "resume",
  },
} as const;

export function defaultLibs(): { path: string }[] {
  return [{ path: GADGET_BIN_PATH }];
}
