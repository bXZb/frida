<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{ pkg: string; label: string }>();
const failed = ref(false);

function initial(label: string): string {
  return (label.trim()[0] || "?").toUpperCase();
}
</script>

<template>
  <img
    v-if="!failed"
    class="bg-secondary size-9 shrink-0 rounded-lg object-cover"
    :src="`ksu://icon/${props.pkg}`"
    :alt="label"
    @error="failed = true"
  />
  <div
    v-else
    class="bg-secondary text-primary flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
  >
    {{ initial(label) }}
  </div>
</template>
