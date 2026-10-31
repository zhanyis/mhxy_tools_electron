<template>
  <div class="items-body-container" :class="{ 'is-readonly': disabled }">
    <section class="item-panel" v-if="!disabled" aria-label="选择物品">
      <header class="panel-header"><strong>选择物品</strong><span>点击添加到获得物品</span></header>
      <div class="panel-scroll">
        <section class="item-category" v-for="group in catalogGroups" :key="group.type">
          <h3 class="category-title">{{ group.type }}<span>{{ group.items.length }}</span></h3>
          <div class="item-grid">
            <button class="catalog-item" v-for="item in group.items" :key="item.id" type="button"
              :title="item.name" :aria-label="`添加${item.name}`" @click="addToBags(item)">
              <el-image class="item-icon" :src="resolveItemImage(item.image)" fit="contain" :alt="item.name" />
              <span class="item-name">{{ item.name }}</span>
            </button>
          </div>
        </section>
      </div>
    </section>
    <section class="item-panel" aria-label="获得物品">
      <header class="panel-header"><strong>获得物品</strong><span>{{ bags.length }} 种 · {{ totalCount }} 件</span></header>
      <div class="panel-scroll">
        <div v-if="!bags.length" class="empty-bags">{{ disabled ? '暂无获得物品' : '点击左侧物品，记录本次获得数量' }}</div>
        <section class="item-category" v-for="group in bagGroups" :key="group.type">
          <h3 class="category-title">{{ group.type }}</h3>
          <div class="bag-grid">
            <div class="bag-item" v-for="item in group.items" :key="item.id">
              <el-image class="item-icon" :src="resolveItemImage(item.image)" fit="contain" :alt="item.name" />
              <span class="item-name" :title="item.name">{{ item.name }}</span>
              <div class="quantity-controls">
                <button v-if="!disabled" type="button" :aria-label="`减少${item.name}`" @click="minsItem(item)">−</button>
                <span class="item-count" :title="`${item.count} 件`">{{ item.count }}</span>
                <button v-if="!disabled" type="button" :aria-label="`增加${item.name}`" @click="addToBags(item)">+</button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { usePrice, PriceItem, CountablePriceItem } from '../hooks/usePrice';
import { computed } from 'vue';
import { resolveItemImage } from '../utils/itemImages';

const bags = defineModel<CountablePriceItem[]>('bags', { type: Array, default: () => ([]) })

const props = defineProps<{
  disabled?: boolean;
}>()

const { originResult } = usePrice();

// Group only for display; keep the original item IDs, prices and saved bags intact.
const groupItems = <T extends PriceItem>(items: T[]) => {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const type = item.type || '其他';
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type)!.push(item);
  }
  return [...groups].map(([type, items]) => ({ type, items }));
};
const catalogGroups = computed(() => groupItems(originResult.value));
const bagGroups = computed(() => groupItems(bags.value));
const totalCount = computed(() => bags.value.reduce((total, item) => total + item.count, 0));

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
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  height: 280px;
  min-height: 0;
}
.items-body-container.is-readonly { grid-template-columns: minmax(0, 1fr); }
.item-panel {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-light);
}
.panel-header span { font-size: 12px; color: var(--el-text-color-secondary); }
.panel-scroll { flex: 1; min-height: 0; padding: 8px; overflow: auto; overscroll-behavior: contain; }
.item-category + .item-category { margin-top: 10px; }
.category-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}
.category-title span { font-weight: 400; color: var(--el-text-color-placeholder); }
.item-grid, .bag-grid { display: grid; gap: 4px; }
.item-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.bag-grid { grid-template-columns: repeat(auto-fill, minmax(min(100%, 208px), 1fr)); }
.catalog-item, .bag-item {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 4px 6px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
  font-size: 12px;
  text-align: left;
}
.catalog-item { cursor: pointer; padding: 6px; font-size: 14px; }
.catalog-item .item-icon { width: 36px; height: 36px; }
.catalog-item:hover { border-color: var(--el-color-primary-light-5); background: var(--el-color-primary-light-9); }
.item-icon { width: 28px; height: 28px; flex-shrink: 0; }
.item-name { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.quantity-controls { display: flex; align-items: center; gap: 3px; flex-shrink: 0; }
.quantity-controls button {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
  cursor: pointer;
}
.quantity-controls button:hover { color: var(--el-color-primary); border-color: var(--el-color-primary); }
.item-count { min-width: 20px; text-align: center; font-variant-numeric: tabular-nums; }
.empty-bags { padding: 24px 8px; text-align: center; font-size: 12px; color: var(--el-text-color-placeholder); }
@media (max-width: 640px) {
  .items-body-container:not(.is-readonly) { grid-template-columns: minmax(0, 1fr); height: 480px; grid-template-rows: 1fr 1fr; }
}
</style>
