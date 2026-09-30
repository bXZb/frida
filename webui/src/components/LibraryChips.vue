<script setup lang="ts">
import { ref } from "vue";
import { Plus, X } from "@lucide/vue";
import type { InjectedLibrary } from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const props = defineProps<{ modelValue: InjectedLibrary[] }>();
const emit = defineEmits<{ "update:modelValue": [InjectedLibrary[]] }>();
const draft = ref("");

function commit(paths: string[]): void {
  const existing = new Set(props.modelValue.map((l) => l.path));
  const next = [...props.modelValue];
  for (const raw of paths) {
    const path = raw.trim();
    if (!path || existing.has(path)) continue;
    existing.add(path);
    next.push({ path });
  }
  emit("update:modelValue", next);
}

function addFromDraft(): void {
  const value = draft.value;
  if (!value.trim()) return;
  commit(value.split("\n"));
  draft.value = "";
}

function onPaste(event: ClipboardEvent): void {
  const text = event.clipboardData?.getData("text") ?? "";
  if (!text.includes("\n")) return;
  event.preventDefault();
  commit(text.split("\n"));
}

function removeAt(index: number): void {
  const next = [...props.modelValue];
  next.splice(index, 1);
  emit("update:modelValue", next);
}
</script>

<template>
  <div class="space-y-2">
    <div
      v-if="modelValue.length"
      class="flex flex-wrap gap-1.5"
    >
      <span
        v-for="(lib, index) in modelValue"
        :key="lib.path"
        class="bg-secondary text-foreground inline-flex max-w-full items-center gap-1 rounded-md py-1 pr-1 pl-2 font-mono text-[11px]"
      >
        <span class="truncate" :title="lib.path">{{ lib.path }}</span>
        <button
          type="button"
          class="text-muted-foreground hover:text-destructive shrink-0 cursor-pointer rounded p-0.5 transition-colors"
          :aria-label="`Remove ${lib.path}`"
          @click="removeAt(index)"
        >
          <X class="size-3" />
        </button>
      </span>
    </div>
    <p v-else class="text-muted-foreground text-xs">
      No libraries — gadget will not load for this target.
    </p>
    <div class="flex gap-2">
      <Input
        v-model="draft"
        class="font-mono text-xs"
        placeholder="/data/local/tmp/libsec/libsecmon.so"
        spellcheck="false"
        @keydown.enter.prevent="addFromDraft"
        @paste="onPaste"
      />
      <Button variant="secondary" size="icon" class="shrink-0" aria-label="Add library" @click="addFromDraft">
        <Plus class="size-4" />
      </Button>
    </div>
  </div>
</template>
