<template>
  <el-input
    v-if="!props.disabled"
    :input-style="{ color: getColorByValue(value) }"
    v-model="value"
  />
  <span v-else :style="{ color: getColorByValue(value) }">{{ value }}</span>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue?: number;
  disabled?: boolean;
}>();

const value = defineModel<number>()
const getColorByValue = (val: number | undefined) => {
  const count = Number(val)
  if (isNaN(count)) return 'black';
  if (count < 100000) return 'black';
  if (count < 1000000) return 'green';
  if (count < 10000000) return 'red';
  if (count < 100000000) return 'purple';
  return 'pink';
};
</script>

<style scoped>
</style>
