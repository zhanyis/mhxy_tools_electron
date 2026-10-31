<template>
  <header class="top-bar">
  <el-menu
    :default-active="activeIndex"
    mode="horizontal"
    @select="handleSelect"
  >
    <el-menu-item index="Today">搬砖</el-menu-item>
    <el-menu-item index="Price">物价</el-menu-item>
    <el-menu-item index="History">历史</el-menu-item>
  </el-menu>
    <div class="top-bar-actions">
      <UpdateNotification />
      <a
        class="github-link"
        href="https://github.com/zhanyis/mhxy_tools_electron"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="打开 GitHub 仓库"
        title="打开 GitHub 仓库"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 .75a11.25 11.25 0 0 0-3.558 21.923c.563.104.768-.244.768-.542 0-.267-.01-.974-.015-1.912-3.13.68-3.79-1.508-3.79-1.508-.512-1.3-1.25-1.646-1.25-1.646-1.023-.7.078-.686.078-.686 1.132.08 1.727 1.162 1.727 1.162 1.006 1.724 2.64 1.226 3.282.938.103-.73.393-1.226.715-1.508-2.499-.284-5.126-1.25-5.126-5.564 0-1.23.44-2.234 1.16-3.021-.116-.285-.503-1.43.11-2.98 0 0 .945-.303 3.094 1.154A10.785 10.785 0 0 1 12 6.182c.956.004 1.919.13 2.817.378 2.148-1.457 3.091-1.154 3.091-1.154.615 1.55.228 2.695.112 2.98.722.787 1.158 1.79 1.158 3.021 0 4.325-2.631 5.277-5.138 5.556.404.35.766 1.04.766 2.098 0 1.515-.014 2.737-.014 3.109 0 .3.203.65.774.54A11.252 11.252 0 0 0 12 .75Z" />
        </svg>
      </a>
    </div>
  </header>
  <RouterView style="flex: 1"></RouterView>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import UpdateNotification from './components/updateNotification.vue'

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
.top-bar {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  border-bottom: 1px solid var(--el-border-color);
}
.top-bar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 12px;
}
.github-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  color: var(--el-text-color-primary);
  transition: color .15s, background-color .15s;
}
.github-link:hover {
  color: var(--el-color-primary);
  background-color: var(--el-fill-color-light);
}
.github-link:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}
.el-menu--horizontal {
  --el-menu-horizontal-height: 48px;
  flex: 1;
  min-width: 0;
  border-bottom: none;
}
</style>
