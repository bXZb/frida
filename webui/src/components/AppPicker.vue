<script setup lang="ts">
import { Check, Search, X } from "@lucide/vue";
import {
  DrawerClose,
  DrawerContent,
  DrawerHandle,
  DrawerOverlay,
  DrawerPortal,
  DrawerRoot,
  DrawerTitle,
} from "reka-ui";
import type { AppFilter } from "../types";
import AppIcon from "./AppIcon.vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

defineProps<{
  open: boolean;
  query: string;
  filter: AppFilter;
  apps: string[];
  loading: boolean;
  labelOf: (pkg: string) => string;
  added: Set<string>;
}>();

const emit = defineEmits<{
  "update:open": [boolean];
  "update:query": [string];
  "update:filter": [AppFilter];
  pick: [string];
}>();

const filters = ["user", "system", "all"] as const;
</script>

<template>
  <DrawerRoot :open="open" @update:open="emit('update:open', $event)">
    <DrawerPortal>
      <DrawerOverlay class="fixed inset-0 z-40 bg-black/70" />
      <DrawerContent
        class="bg-card fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] w-full max-w-xl flex-col gap-3 rounded-t-2xl border-t p-4 pb-[calc(1rem+var(--safe-bottom))] outline-none"
      >
        <DrawerHandle class="bg-border mx-auto h-1 w-10 shrink-0 rounded-full" />

        <div class="flex items-center justify-between gap-3">
          <DrawerTitle class="text-sm font-semibold">Select app</DrawerTitle>
          <DrawerClose as-child>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <X class="size-4" />
            </Button>
          </DrawerClose>
        </div>

        <div class="relative">
          <Search
            class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            :model-value="query"
            placeholder="Search packages…"
            class="pr-9 pl-9"
            @update:model-value="emit('update:query', String($event))"
          />
          <button
            v-if="query"
            type="button"
            class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded p-1 transition-colors"
            aria-label="Clear search"
            @click="emit('update:query', '')"
          >
            <X class="size-3.5" />
          </button>
        </div>

        <div class="grid grid-cols-3 gap-2">
          <Button
            v-for="f in filters"
            :key="f"
            size="sm"
            class="capitalize"
            :variant="filter === f ? 'default' : 'outline'"
            @click="emit('update:filter', f)"
          >
            {{ f }}
          </Button>
        </div>

        <div class="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          <div v-if="loading && !apps.length" class="space-y-1">
            <div
              v-for="i in 8"
              :key="i"
              class="flex items-center gap-3 px-1 py-2"
            >
              <Skeleton class="size-9 rounded-lg" />
              <div class="flex-1 space-y-1.5">
                <Skeleton class="h-3.5 w-28" />
                <Skeleton class="h-2.5 w-40" />
              </div>
            </div>
          </div>

          <p v-else-if="!apps.length" class="text-muted-foreground py-10 text-center text-sm">
            No apps found
          </p>

          <template v-else>
            <button
              v-for="pkg in apps"
              :key="pkg"
              type="button"
              class="flex w-full items-center gap-3 border-b px-1 py-2 text-left transition-colors last:border-0"
              :class="added.has(pkg) ? 'opacity-50' : 'hover:bg-accent/60 cursor-pointer'"
              :disabled="added.has(pkg)"
              @click="!added.has(pkg) && emit('pick', pkg)"
            >
              <AppIcon :pkg="pkg" :label="labelOf(pkg)" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ labelOf(pkg) }}</span>
                <span class="block truncate font-mono text-[11px] text-muted-foreground">
                  {{ pkg }}
                </span>
              </span>
              <Check v-if="added.has(pkg)" class="text-muted-foreground size-4 shrink-0" />
            </button>
          </template>
        </div>
      </DrawerContent>
    </DrawerPortal>
  </DrawerRoot>
</template>
