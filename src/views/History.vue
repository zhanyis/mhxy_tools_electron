<template>
  <el-table :data="tableData" style="width: 100%" show-summary>
    <el-table-column prop="start" label="开始时间" width="110" />
    <el-table-column prop="end" label="结束时间" width="110" />
    <el-table-column prop="time" label="在线时长" width="90" />
    <el-table-column prop="profit" label="净收益(元)" sortable width="120" />
    <el-table-column prop="goldPrice" label="金价(每3000w)" sortable min-width="160" />
    <el-table-column prop="point" label="点卡消耗价值" width="110" />
    <el-table-column prop="mhb" label="梦幻币收益" width="120" />
    <el-table-column prop="bagsGain" label="物品收益" width="100" />
    <el-table-column prop="sameTimeAccount" label="同时在线账号" width="120" />
    <el-table-column fixed="right" label="操作" min-width="120">
      <template #default="{ row }">
        <el-button link type="primary" size="small" @click="openBagsDetail(row.bags)" :disabled="(row.bagsGain || 0) <= 0">
          查看物品
        </el-button>
        <el-button link type="danger" size="small" @click="handleDelete(row.id)">删除</el-button>
      </template>
    </el-table-column>
  </el-table>

  <el-drawer
    v-model="drawer"
    title="物品收益"
    size="445"
  >
    <itemsTransfer :bags="bags" disabled />
  </el-drawer>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import itemsTransfer from '../components/itemsTransfer.vue';

const tableData = ref([]);

const bags = ref([]);
const drawer = ref(false);

const openBagsDetail = (stringBag: string) => {
  bags.value = JSON.parse(stringBag);
  drawer.value = true;
};

onMounted(() => {
  window.ipcRenderer.invoke('db:getRecords').then((res) => {
    console.log(res);
    tableData.value = res;
  });
});

const handleDelete = (id: number) => {
  ElMessageBox.confirm(
    '确定要删除这条记录吗？',
    '警告',
    {
      confirmButtonText: 'OK',
      cancelButtonText: 'Cancel',
      type: 'warning',
    }
  )
    .then(() => {
      window.ipcRenderer.invoke('db:deleteRecord', 'id', id).then(() => {
        ElMessage({
          type: 'success',
          message: '删除成功',
        });
        window.ipcRenderer.invoke('db:getRecords').then((res) => {
          tableData.value = res;
        });
      });
    });
};
</script>
