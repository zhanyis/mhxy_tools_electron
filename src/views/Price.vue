<template>
  <el-card shadow="never" style="overflow-y: scroll">
    <el-descriptions
      v-for="type in Object.keys(price)"
      :title="type"
      :column="2"
    >
      <el-descriptions-item
        v-for="name in Object.keys(price[type])"
        :label="name"
      >
        <template #label>
          <div
            style="
              width: 130px;
              display: inline-flex;
              align-items: center;
            ">
            <el-image
              style="width: 32px; height: 32px; margin-right: 6px;"
              :src="price[type][name].image"
              fit="contain"
              :alt="name"
            />
            {{ name }}
          </div>
        </template>
        <el-input
          style="width: 100px"
          v-model="price[type][name].price"
        ></el-input>
      </el-descriptions-item>
    </el-descriptions>
  </el-card>
</template>

<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import { usePrice } from '../hooks/usePrice';

const { price, originPrice } = usePrice();

onBeforeUnmount(() => {
  console.log('onBeforeUnmount');
  let diff = [];
  for (const type in price.value) {
    for (const name in price.value[type]) {
      console.log(price.value[type][name].price, originPrice.value[name]);
      if (price.value[type][name].price !== originPrice.value[name]) {
        diff.push({ type, name, price: Number(price.value[type][name].price), id: price.value[type][name].id, image: price.value[type][name].image });
      }
    }
  }
  window.ipcRenderer.invoke('db:setPrice', diff);
});
</script>
