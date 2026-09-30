<script setup lang="ts">
import { ref } from "vue";
import { ChevronDown, X } from "@lucide/vue";
import type { Target } from "../types";
import AppIcon from "./AppIcon.vue";
import LibraryChips from "./LibraryChips.vue";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const props = defineProps<{
  target: Target;
  label: string;
  open: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
  remove: [string];
}>();

const confirmOpen = ref(false);
</script>

<template>
  <AlertDialog v-model:open="confirmOpen">
    <Card class="gap-0 overflow-hidden py-0">
      <button
        type="button"
        class="flex w-full min-w-0 cursor-pointer items-center gap-3 p-3 text-left"
        @click="emit('toggle')"
      >
        <AppIcon :pkg="target.app_name" :label="label" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-semibold">{{ label }}</span>
          <span class="block truncate font-mono text-[11px] text-muted-foreground">
            {{ target.app_name }}
          </span>
        </span>
        <span class="shrink-0" @click.stop>
          <Switch :model-value="target.enabled" @update:model-value="target.enabled = $event" />
        </span>
        <AlertDialogTrigger as-child>
          <Button
            variant="ghost"
            size="icon-sm"
            class="text-muted-foreground hover:text-destructive shrink-0"
            aria-label="Remove target"
            @click.stop
          >
            <X class="size-4" />
          </Button>
        </AlertDialogTrigger>
        <ChevronDown
          class="text-muted-foreground size-4 shrink-0 transition-transform duration-200"
          :class="open ? 'rotate-180' : ''"
        />
      </button>

      <div
        class="grid transition-[grid-template-rows] duration-200 ease-out"
        :style="{ gridTemplateRows: open ? '1fr' : '0fr' }"
      >
        <div class="overflow-hidden">
          <CardContent class="space-y-4 border-t px-3 pt-3">
            <div class="flex items-center justify-between gap-3">
              <span class="text-[11px] tracking-[0.12em] uppercase text-muted-foreground">
                Kernel evasion
              </span>
              <Switch v-model="target.kernel_assisted_evasion" />
            </div>

            <div class="space-y-1.5">
              <label class="text-[11px] tracking-[0.12em] uppercase text-muted-foreground">
                Delay (ms)
              </label>
              <Input
                v-model="target.start_up_delay_ms"
                type="number"
                min="0"
                class="tabular-nums"
              />
            </div>

            <div class="space-y-1.5">
              <label class="text-[11px] tracking-[0.12em] uppercase text-muted-foreground">
                Injected libraries
              </label>
              <LibraryChips v-model="target.injected_libraries" />
            </div>

            <div class="space-y-3">
              <div class="flex items-center justify-between gap-3">
                <span class="text-[11px] tracking-[0.12em] uppercase text-muted-foreground">
                  Child gating
                </span>
                <Switch v-model="target.child_gating.enabled" />
              </div>
              <div v-if="target.child_gating.enabled" class="space-y-3">
                <Select v-model="target.child_gating.mode">
                  <SelectTrigger class="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="freeze">Freeze</SelectItem>
                    <SelectItem value="kill">Kill</SelectItem>
                    <SelectItem value="inject">Inject</SelectItem>
                  </SelectContent>
                </Select>
                <div class="space-y-1.5">
                  <label class="text-[11px] tracking-[0.12em] uppercase text-muted-foreground">
                    Child libraries
                  </label>
                  <LibraryChips v-model="target.child_gating.injected_libraries" />
                </div>
              </div>
            </div>
          </CardContent>
        </div>
      </div>
    </Card>

    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Remove target?</AlertDialogTitle>
        <AlertDialogDescription>
          {{ label }} ({{ target.app_name }}) will no longer be injected.
          Change is saved on Save.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          class="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/40"
          @click="emit('remove', props.target.app_name)"
        >
          Remove
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
