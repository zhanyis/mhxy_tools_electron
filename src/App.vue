<template>
  <el-menu
    :default-active="activeIndex"
    mode="horizontal"
    @select="handleSelect"
  >
    <el-menu-item index="Today">搬砖</el-menu-item>
    <el-menu-item index="Price">物价</el-menu-item>
    <el-menu-item index="History">历史</el-menu-item>
  </el-menu>
  <RouterView style="flex: 1"></RouterView>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Link } from '@element-plus/icons-vue';

const router = useRouter()

const activeIndex = ref('')
const handleSelect = (key: string) => {
  activeIndex.value = key
  router.push(`/${key.toLowerCase()}`)
}

onMounted(() => {
  handleSelect('Today')
})

</script>

<style lang="css" scoped>
.el-menu--horizontal {
  --el-menu-horizontal-height: 48px;
}
</style>
