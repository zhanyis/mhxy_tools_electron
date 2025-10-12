<template>
  <el-table :data="tableData" style="width: 100%" height="100%" show-summary :summary-method="getSummaries">
    <el-table-column prop="start" label="开始时间" width="110" />
    <el-table-column prop="end" label="结束时间" width="110" />
    <el-table-column prop="time" label="在线时长" width="90" />
    <el-table-column prop="profit" label="净收益(元)" sortable width="120" />
    <el-table-column prop="goldPrice" label="金价(每3000w)" sortable min-width="160" />
    <el-table-column prop="point" label="点卡消耗价值" width="110">
      <template #default="{ row }">
        <price-input :model-value="row.point" disabled />
      </template>
    </el-table-column>
    <el-table-column prop="mhb" label="梦幻币收益" width="120">
      <template #default="{ row }">
        <price-input :model-value="row.mhb" disabled />
      </template>
    </el-table-column>
    <el-table-column prop="bagsGain" label="物品收益" width="100">
      <template #default="{ row }">
        <price-input :model-value="row.bagsGain" disabled />
      </template>
    </el-table-column>
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
import { onMounted, ref, h } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import itemsTransfer from '../components/itemsTransfer.vue';
import type { VNode } from 'vue'
import type { TableColumnCtx } from 'element-plus'
import priceInput from '../components/priceInput.vue';

interface Record {
  id: number
  start: string
  end: string
  time: string
  profit: number
  goldPrice: number
  point: number
  mhb: number
  bagsGain: number
  sameTimeAccount: number
  bags: string // JSON string of items
  [key: string]: any // 添加索引签名来解决类型访问问题
}

interface SummaryMethodProps<T extends Record = Record> {
  columns: TableColumnCtx<T>[]
  data: T[]
}

const tableData = ref([]);

const bags = ref([]);
const drawer = ref(false);

const openBagsDetail = (stringBag: string) => {
  bags.value = JSON.parse(stringBag);
  drawer.value = true;
};

const getSummaries = (param: SummaryMethodProps) => {
  const { columns, data } = param
  const sums: (string | VNode)[] = []
  columns.forEach((column, index) => {
    if (index === 0) {
      sums[index] = h('div', { style: { textDecoration: 'underline' } }, [
        '合计',
      ])
      return
    }
    // 只有在线时长 和净收益需要统计
    if (column.property === 'time') {
      // 00:00:00
      const totalSeconds = data.reduce((acc, item) => {
        const timeParts = item[column.property].split(':').map(Number);
        const seconds = timeParts.reduce((total: number, part: number, index: number) => total + part * Math.pow(60, 2 - index), 0);
        return acc + seconds;
      }, 0);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      sums[index] = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    } else if (column.property === 'profit') {
      sums[index] = data.map((item) => item[column.property]).reduce((prev, curr) => {
        const value = Number(curr || 0)
        return prev + value
      }, 0).toFixed(2)
    } else {
      sums[index] = ''
    }
  })

  return sums
}


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
