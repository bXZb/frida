import java.nio.file.Files
import java.security.MessageDigest
import org.apache.tools.ant.filters.FixCrLfFilter
import org.apache.tools.ant.filters.ReplaceTokens

plugins {
    alias(libs.plugins.android.library)
}

val magiskModuleId = providers.gradleProperty("magiskModuleId").get()
val moduleName = providers.gradleProperty("moduleName").get()
val moduleVersion = providers.gradleProperty("moduleVersion").get()
val moduleVersionCode = providers.gradleProperty("moduleVersionCode").get()
val moduleAuthor = providers.gradleProperty("moduleAuthor").get()
val moduleDescription = providers.gradleProperty("moduleDescription").get()

val outDir = rootProject.layout.projectDirectory.dir("out")
val webuiDir = rootProject.layout.projectDirectory.dir("webui")
val templateDir = rootProject.layout.projectDirectory.dir("template/magisk_module")

val npmCommand = if (org.gradle.internal.os.OperatingSystem.current().isWindows) "npm.cmd" else "npm"

val npmInstallWebui = tasks.register<Exec>("npmInstallWebui") {
    workingDir(webuiDir)
    commandLine(npmCommand, "install")
    onlyIf { !webuiDir.dir("node_modules").asFile.exists() }
    outputs.dir(webuiDir.dir("node_modules"))
}

val buildWebui = tasks.register<Exec>("buildWebui") {
    dependsOn(npmInstallWebui)
    workingDir(webuiDir)
    commandLine(npmCommand, "run", "build")
    inputs.dir(webuiDir.dir("src"))
    inputs.files(webuiDir.file("package.json"), webuiDir.file("vite.config.ts"), webuiDir.file("index.html"))
    outputs.dir(templateDir.dir("webroot"))
}

android {
    namespace = "zygisk.frida"
    compileSdk = 34
    ndkVersion = "25.2.9519653"

    flavorDimensions += "api"

    defaultConfig {
        minSdk = 23

        externalNativeBuild {
            ndkBuild {
                arguments += listOf(
                    "MODULE_VERSION_CODE=$moduleVersionCode",
                    "MODULE_VERSION_NAME=$moduleVersion",
                )
            }
        }
    }

    buildFeatures {
        prefab = true
    }

    externalNativeBuild {
        ndkBuild {
            path("src/jni/Android.mk")
        }
    }

    productFlavors {
        create("Zygisk") {
            dimension = "api"
        }
    }
}

dependencies {
    implementation(libs.rikka.cxx)
    implementation(libs.dobby)
}

androidComponents {
    val adb = sdkComponents.adb

    onVariants { variant ->
        val variantCapped = variant.name.replaceFirstChar { it.uppercaseChar() }
        val buildType = variant.buildType
        val flavorLowered = variant.flavorName!!.lowercase()

        val zipName = "$moduleName-$moduleVersion-$flavorLowered-$buildType.zip"
        val magiskDir = outDir.dir("magisk_module_${flavorLowered}_$buildType")

        tasks.register<Sync>("prepareMagiskFiles$variantCapped") {
            dependsOn("assemble$variantCapped")
            dependsOn(buildWebui)
            duplicatesStrategy = DuplicatesStrategy.EXCLUDE

            into(magiskDir)
            from(rootProject.layout.projectDirectory) {
                include("config.json.example")
            }
            from(templateDir) {
                exclude("module.prop", "customize.sh", "verify.sh")
            }
            from(templateDir) {
                include("module.prop")
                expand(
                    "id" to magiskModuleId,
                    "name" to moduleName,
                    "version" to moduleVersion,
                    "versionCode" to moduleVersionCode,
                    "author" to moduleAuthor,
                    "description" to "$moduleDescription (flavor: $flavorLowered)",
                )
                filter<FixCrLfFilter>("eol" to FixCrLfFilter.CrLf.newInstance("lf"))
            }
            from(templateDir) {
                include("customize.sh", "verify.sh")
                filter<ReplaceTokens>(
                    "tokens" to mapOf(
                        "FLAVOR" to flavorLowered,
                        "MODULE_ID" to magiskModuleId,
                    ),
                )
                filter<FixCrLfFilter>("eol" to FixCrLfFilter.CrLf.newInstance("lf"))
            }
            from(templateDir.dir("webroot")) {
                into("webroot")
            }
            from(layout.buildDirectory.dir("intermediates/stripped_native_libs/$variantCapped/strip${variantCapped}DebugSymbols/out/lib")) {
                into("lib")
            }
            doLast {
                // Flatten lib/<abi>/libzygiskfrida.so to lib/<abi>.so (Zygisk convention)
                val libRoot = magiskDir.asFile.resolve("lib")
                libRoot.listFiles()?.forEach { abiDir ->
                    if (!abiDir.isDirectory) return@forEach
                    val so = abiDir.resolve("libzygiskfrida.so")
                    if (so.exists()) {
                        Files.move(so.toPath(), libRoot.resolve("${abiDir.name}.so").toPath())
                    }
                    abiDir.deleteRecursively()
                }

                // Emit a .sha256sum next to every packaged file (consumed by verify.sh)
                val root = magiskDir.asFile
                root.walkTopDown().filter { it.isFile }.forEach { f ->
                    val hex = MessageDigest.getInstance("SHA-256")
                        .digest(f.readBytes())
                        .joinToString("") { "%02x".format(it) }
                    root.resolve(f.relativeTo(root).path + ".sha256sum").writeText(hex)
                }
            }
        }

        tasks.register<Zip>("zip$variantCapped") {
            dependsOn("prepareMagiskFiles$variantCapped")
            from(magiskDir)
            archiveFileName.set(zipName)
            destinationDirectory.set(outDir)
        }

        tasks.register<Exec>("push$variantCapped") {
            dependsOn("zip$variantCapped")
            workingDir(outDir)
            commandLine(adb.get().asFile, "push", zipName, "/data/local/tmp/")
        }

        tasks.register<Exec>("flash$variantCapped") {
            dependsOn("push$variantCapped")
            commandLine(
                adb.get().asFile, "shell", "su", "-c",
                "magisk --install-module /data/local/tmp/$zipName",
            )
        }

        tasks.register<Exec>("flashAndReboot$variantCapped") {
            dependsOn("flash$variantCapped")
            commandLine(adb.get().asFile, "shell", "reboot")
        }

        tasks.matching { it.name == "assemble$variantCapped" }.configureEach {
            finalizedBy("zip$variantCapped")
        }
    }
}
