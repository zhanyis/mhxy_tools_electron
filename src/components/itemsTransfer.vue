<template>
  <div class="items-body-container" :style="{ 'grid-template-columns': disabled ? '1fr' : '1fr 1fr' }">
    <div class="sub-item-container" v-if="!disabled">
      <div
        class="item-image"
        v-for="item in originResult"
        :key="item.id"
        @click="addToBags(item)"
      >
        <el-avatar shape="square" size="large" :src="item.image" fit="contain" />
        <div>{{ item.name }}</div>
      </div>
    </div>

    <div
      class="sub-item-container"
    >
      <div
        class="item-image"
        v-for="item in bags"
        :key="item.id"
      >
        <el-badge value="-" :offset="[0, 55]" color="red" @click="minsItem(item)" :hidden="disabled">
          <el-badge :value="item.count" >
            <el-avatar shape="square" size="large" :src="item.image" fit="contain" />
          </el-badge>
        </el-badge>
        <div style="margin-top: -8px;">{{ item.name }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePrice, PriceItem, CountablePriceItem } from '../hooks/usePrice';

const bags = defineModel<CountablePriceItem[]>('bags', { type: Array, default: () => ([]) })

const props = defineProps<{
  disabled?: boolean;
}>()

const { originResult } = usePrice();

const addToBags = (item: PriceItem) => {
  const index = bags.value.findIndex((i) => i.id === item.id);
  if (index === -1) {
    bags.value = [...bags.value, { ...item, count: 1 }];
  } else {
    bags.value = bags.value.map((i) => {
      if (i.id === item.id) {
        return { ...i, count: i.count + 1 };
      }
      return i;
    });
  }
};

// const clearItems = (item: PriceItem) => {
//   const index = bags.value.findIndex((i) => i.id === item.id);
//   if (index === -1) {
//     return;
//   }
//   bags.value = bags.value.filter((i) => i.id !== item.id);
// }

const minsItem = (item: CountablePriceItem) => {
  const index = bags.value.findIndex((i) => i.id === item.id);
  if (index === -1) {
    return;
  }
  if (item.count === 1) {
    bags.value = bags.value.filter((i) => i.id !== item.id);
  } else {
    bags.value = bags.value.map((i) => {
      if (i.id === item.id) {
        return { ...i, count: i.count - 1 };
      }
      return i;
    });
  }
}
</script>

<style scoped>
.items-body-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  height: 200px;
  flex-grow: 1;
}

.sub-item-container {
  /* border-radius: var(--el-input-border-radius, var(--el-border-radius-base)); */
  box-shadow: 0 0 0 1px var(--el-input-border-color, var(--el-border-color)) inset;
  padding: 6px;
  overflow: auto;
  height: 100%;
}

.item-image {
  cursor: pointer;
  /* border-radius: var(--el-input-border-radius, var(--el-border-radius-base));
  box-shadow: 0 0 0 1px var(--el-input-border-color, var(--el-border-color)) inset; */
  position: relative;
  width: 60px;
  /* height: 60px; */
  /* width: 80px; */
  margin: 4px;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.close-items {
  position: absolute;
  top: -0.3rem;
  right: -0.5rem;
  cursor: pointer;
  border-radius: 50%;
  background: red;
  color: #fff;
}

.minus-items {
  position: absolute;
  bottom: -0.3rem;
  right: -0.5rem;
  cursor: pointer;
  border-radius: 50%;
  background: red;
  color: #fff;
}
</style>
