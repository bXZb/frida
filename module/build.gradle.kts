import java.nio.file.Files
import java.security.MessageDigest
import org.apache.tools.ant.filters.FixCrLfFilter
import org.apache.tools.ant.filters.ReplaceTokens

plugins {
    id("com.android.library") version "9.4.0"
}

// Magisk module metadata (single source of truth; expanded into module.prop)
val magiskModuleId = "ksufrida"
val moduleName = "KsuFrida"
val moduleVersion = "v1.9.32"
val moduleVersionCode = "42"
val moduleAuthor = "bXZb"
val moduleDescription = "Frida gadget injection module for KernelSU via Zygisk"

val outDir = rootProject.layout.projectDirectory.dir("out")
val webuiDir = rootProject.layout.projectDirectory.dir("webui")
val templateDir = rootProject.layout.projectDirectory.dir("template/magisk_module")

val npmCommand = if (org.gradle.internal.os.OperatingSystem.current().isWindows) "npm.cmd" else "npm"

val npmInstallWebui = tasks.register<Exec>("npmInstallWebui") {
    workingDir(webuiDir)
    commandLine(npmCommand, "install")
    onlyIf { !it.outputs.files.single().exists() }
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
    implementation("dev.rikka.ndk.thirdparty:cxx:1.2.0")
    implementation("io.github.vvb2060.ndk:dobby:1.2")
}

androidComponents {
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

        tasks.matching { it.name == "assemble$variantCapped" }.configureEach {
            finalizedBy("zip$variantCapped")
        }
    }
}
