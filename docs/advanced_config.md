# Advanced Config

For the previous configuration method with various files, see [simple config](simple_config.md).
It remains a valid method of configuration but the structured configuration method specified here is the preferred
method and supports more features.

Both configurations are supported with the advanced config taking precedence in case an app appears in both.

## Config File

This module is configured via a json config located at `/data/local/tmp/libsec/config.json`.
A first install writes `{ "targets": [] }` if that file does not already exist. `config.json.example` is the same empty stub — it is not a live demo target.

Prefer adding apps from the KernelSU WebUI. To start from a blank file manually:
```shell
adb shell su -c 'printf "%s\n" "{ \"targets\": [] }" > /data/local/tmp/libsec/config.json'
```

Example config
```json
{
    "targets": [
        {
            "app_name": "com.example.package",
            "enabled": true,
            "kernel_assisted_evasion": false,
            "start_up_delay_ms": 0,
            "injected_libraries": [
                {
                    "path": "/data/local/tmp/libsec/libsecmon.so"
                }
            ],
            "child_gating": {
                "enabled": false,
                "mode": "freeze",
                "injected_libraries": [
                    {
                        "path": "/data/local/tmp/libsec/libsecmon-child.so"
                    }
                ]
            }
        }
    ]
}
```

The config contains an array of targets. A target contains the configuration for one application
you want to inject with frida.

In case things are not working as expected, check `adb logcat -s KsuFrida` to see if an error is logged.

## Target configuration

### app_name
The bundle id of the application you want to inject frida into.

### enabled
If set to false, then this module will ignore this configuration.
This is useful if you want to temporarily disable a target while maintaining the config.

### kernel_assisted_evasion
Enables kernel-assisted evasion for the target process (KSIE). Requires KernelSU with compatible kernel patches.

### start_up_delay_ms
Injection of libraries is delayed by this amount in milliseconds.

There are times that you might want to delay the injection of the gadget. Some applications
might run checks at start up and delaying the injection can help avoid these.

### injected_libraries
These are the libraries that will be injected into the process. The libraries
specified here will be loaded in the order of the array.

The gadget is **not** bundled in the module ZIP and is **not** unpacked on install.
Place a Frida gadget shared library (not `frida-server`) at `/data/local/tmp/libsec/libsecmon.so`
via WebUI (**Gadget Binary** → scan / path → Install) or `cp`. Match the ABI of the target process
(`android-arm` vs `android-arm64`). For 32-bit-only apps on a 64-bit device, install a 32-bit gadget
as a separate file (for example `libsecmon32.so`) and point `injected_libraries` at that path.

You can adjust the gadget config at `/data/local/tmp/libsec/libsecmon.config.so` according to the official [Gadget Doc](https://frida.re/docs/gadget/).

Using this you can also inject arbitrary libraries alongside the gadget, or omit the gadget by leaving
`injected_libraries` empty. Make sure the libraries have permissions the app can read.

The module sets `0644` on `/data/local/tmp/libsec` on install but will not overwrite an existing
`libsecmon.so` or `config.json`. If you suspect a permission issue, `chmod 644` the files in that directory.


## Child gating configuration (experimental)
This is an experimental feature and has a lot of caveats! Please read carefully.

This module is able to intercept fork/vfork within the process to instrument child processes.
An application might fork a child process to run checks from there that you can't intercept
without child gating.

By enabling this feature by setting `enabled` to true, you can configure how to deal
with these child processes.

There are currently 3 modes in how child gating operates. You can determine by
setting the mode to either `freeze`, `kill` or `inject`.

Using any of the child gating mode can cause issues properly shutting down the application even with a force close.
This can cause issues restarting the app. Manually killing the app can resolve this.
```
adb shell su -c 'kill -9 $(pidof com.example.package)'
```

### freeze
The child process will not return from the fork. This means that no code will
run within the child process but the process itself stays alive.

### kill
The child process will be killed as soon as it is forked. No code will
run within the child process.

### inject
This mode will inject the `injected_libraries` into the child process similar to the target configuration.
After injection the child process will resume its normal code flow. You may fail to connect to the gadget
interactively if the child is only doing a quick check and exits.

Please be aware as the child is forked, it already contains all libraries loaded that the parent process had.
But as only a single thread returns from the fork the loaded frida gadget thread is not present in the child process.

Reloading the same bundled gadget will fail to start. For this to work you have to load a copy of the gadget.
You can't load the same file into the process again, a symbolic link won't work either it must be a copy.

```shell
adb shell su -c 'cp /data/local/tmp/libsec/libsecmon.so /data/local/tmp/libsec/libsecmon-child.so'
```

The default configuration of a gadget will fail to start due to port conflict with the gadget in the parent process.
So for the child process you would have to configure the gadget to use a different port.

Create a gadget configuration at `/data/local/tmp/libsec/libsecmon-child.config.so`.
See [Gadget Doc](https://frida.re/docs/gadget/) for reference.
```json
{
  "interaction": {
    "type": "listen",
    "address": "127.0.0.1",
    "port": 27043,
    "on_port_conflict": "pick-next",
    "on_load": "wait"
  }
}
```

Please take note of the `on_port_conflict: pick-next` which is important in case the parent process forks
multiple children.

Check `adb logcat -s Frida` to see which ports the child gadget started on.

Then connect via
```shell
adb forward tcp:27043 tcp:27043
frida -H 127.0.0.1:27043 -n Gadget
```
