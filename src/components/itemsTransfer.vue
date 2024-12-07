<template>
  <div class="items-body-container" :style="{ 'grid-template-columns': disabled ? '1fr' : '1fr 1fr' }">
    <div class="sub-item-container" v-if="!disabled">
      <el-image
        class="item-image"
        v-for="item in originResult"
        :key="item.id"
        :src="item.image"
        :alt="item.name"
        fit="contain"
        @click="addToBags(item)"
      >
        <template #error>
          {{ item.name }}
        </template>
      </el-image>
    </div>

    <div
      class="sub-item-container"
    >
      <div
        class="item-image"
        v-for="item in bags"
        :key="item.id"
      >
        <el-image
          :src="item.image"
          :alt="item.name"
          fit="contain"
          style="height: 48px; width: 48px"
        >
          <template #error>
            <div style="
              overflow: hidden;
              height: 48px;
              width: 48px;
            ">{{ item.name }}</div>
          </template>
        </el-image>
        <div class="item-counts">
          {{ item.count }}
        </div>
        <el-icon class="close-items" @click="clearItems(item)" v-show="!disabled" >
          <CloseBold />
        </el-icon>
        <el-icon v-show="item.count > 1 && !disabled" class="minus-items" @click="minsItem(item)" >
          <Minus />
        </el-icon>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePrice, PriceItem, CountablePriceItem } from '../hooks/usePrice';
import { CloseBold, Minus } from '@element-plus/icons-vue';

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

const clearItems = (item: PriceItem) => {
  const index = bags.value.findIndex((i) => i.id === item.id);
  if (index === -1) {
    return;
  }
  bags.value = bags.value.filter((i) => i.id !== item.id);
}

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
  gap: 20px;
  height: 200px;
  flex-grow: 1;
}

.sub-item-container {
  border-radius: var(--el-input-border-radius, var(--el-border-radius-base));
  box-shadow: 0 0 0 1px var(--el-input-border-color, var(--el-border-color)) inset;
  padding: 6px;
  overflow: auto;
  height: 100%;
}

.item-image {
  cursor: pointer;
  border-radius: var(--el-input-border-radius, var(--el-border-radius-base));
  box-shadow: 0 0 0 1px var(--el-input-border-color, var(--el-border-color)) inset;
  position: relative;
  width: 48px;
  height: 48px;
  margin: 4px;
  display: inline-block;
}

.item-counts {
  position: absolute;
  bottom: -0.3rem;
  left: 0;
  font-weight: bold;
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
  background: #409eff;
  color: #fff;
}
</style>
