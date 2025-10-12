<template>
  <div class="today-body">
    <el-descriptions title="搬砖记录" :column="2" :label-width="130" border>
      <template #extra>
        <el-button class="ml-2" type="primary" plain @click="startTimer" v-if="timeStart === 0">开始计时</el-button>
        <el-button class="ml-2" type="danger" plain @click="endTimer" v-else>结束计时</el-button>
        <el-button class="ml-2" type="success" plain @click="saveRecord">记录收益</el-button>
        <el-button class="ml-2" type="warning" plain style="margin-left: 0.5rem" @click="resetRecordConfirm">重置记录</el-button>
      </template>
      <el-descriptions-item label="金价(每3000w)"><el-input v-model="goldPrice" /></el-descriptions-item>
      <el-descriptions-item label="在线时长">{{ timeConsumed }}</el-descriptions-item>
      <el-descriptions-item label="点卡"><priceInput v-model="pointPrice" /></el-descriptions-item>
      <el-descriptions-item label="点卡消费MHB"><priceInput :modelValue="Number(pointConsumed)" disabled /></el-descriptions-item>
      <el-descriptions-item label="初始MHB"><priceInput v-model="initCash" /></el-descriptions-item>
      <el-descriptions-item label="物品收益MHB"><priceInput v-model="bagsGain" /></el-descriptions-item>
      <el-descriptions-item label="结束MHB"><priceInput v-model="endCash" /></el-descriptions-item>
      <el-descriptions-item label="累计收益MHB"><priceInput v-model="netMhb" /></el-descriptions-item>
      <el-descriptions-item label="同时打开账号"><el-input-number v-model="sameTimeAccount" :min="1" /></el-descriptions-item>
      <el-descriptions-item label="换算现金收益">{{ sumProfit }}</el-descriptions-item>
    </el-descriptions>
    <!-- <p class="mt-1 el-descriptions__title">背包</p> -->
    <itemsTransfer class="mt-1" v-model:bags="bags"/>
  </div>
</template>

<script setup lang="ts">
import itemsTransfer from '../components/itemsTransfer.vue';
import { useTodayStore } from '../store/useTodayStore';
import { storeToRefs } from 'pinia';
import { useSettings } from '../hooks/useSettings';
import { computed } from 'vue';
import { useTimestamp } from '@vueuse/core'
import dayjs from 'dayjs';
import { ElMessage, ElMessageBox } from 'element-plus'
import priceInput from '../components/priceInput.vue';

const { goldPrice, pointPrice, sameTimeAccount, initCash } = useSettings();

const { bags, timeStart, endCash, accumulatedTime, recordStart } = storeToRefs(useTodayStore());
const { resetRecord } = useTodayStore();

const { timestamp, pause, resume } = useTimestamp({ controls: true })

const netMhb = computed(() => {
  return endCash.value - initCash.value - Number(pointConsumed.value) + bagsGain.value;
})

const timeConsumed = computed(() => {
  if (timeStart.value === 0) {
    return accumulatedTime.value;
  }
  const diffSecond = dayjs(timestamp.value).diff(timeStart.value, 's');
  return sumTime(formatSecond(diffSecond), accumulatedTime.value);
})

pause();

const pointConsumed = computed(() => {
  const totalSecond = timeConsumed.value.split(':').reduce((acc, cur, index) => {
    return acc + parseInt(cur) * Math.pow(60, 2 - index);
  }, 0);
  return (((totalSecond * sameTimeAccount.value) / 600) * pointPrice.value).toFixed(0);
})

const startTimer = () => {
  if (accumulatedTime.value === '00:00:00') {
    recordStart.value = new Date().valueOf();
  }
  timeStart.value = new Date().valueOf();
  resume();
}

const bagsGain = computed(() => {
  const total = bags.value.reduce((acc, cur) => {
    return acc + cur.count * cur.price;
  }, 0);
  return total;
})

const sumProfit = computed(() => {
  return ((netMhb.value + bagsGain.value - Number(pointConsumed.value)) * goldPrice.value / 30000000).toFixed(2);
})

const endTimer = () => {
  accumulatedTime.value = timeConsumed.value;
  timeStart.value = 0;
  pause();
}

const sumTime = (time1: string, time2: string) => {
  const time1Arr = time1.split(':');
  const time2Arr = time2.split(':');
  const totalSecond = parseInt(time1Arr[0]) * 3600 + parseInt(time1Arr[1]) * 60 + parseInt(time1Arr[2]) + parseInt(time2Arr[0]) * 3600 + parseInt(time2Arr[1]) * 60 + parseInt(time2Arr[2]);
  return formatSecond(totalSecond);
}

const formatSecond = (second: number) => {
  const hour = Math.floor(second / 3600) < 10 ? `0${Math.floor(second / 3600)}` : Math.floor(second / 3600);
  const minute = Math.floor((second % 3600) / 60) < 10 ? `0${Math.floor((second % 3600) / 60)}` : Math.floor((second % 3600) / 60);
  const sec = (second % 60) < 10 ? `0${second % 60}` : second % 60;
  return `${hour}:${minute}:${sec}`;
}

const resetRecordConfirm = () => {
  ElMessageBox.confirm(
    '确定要重置现有记录吗？这将清空所有当前记录数据。',
    '警告',
    {
      confirmButtonText: '确定重置',
      cancelButtonText: '取消',
      type: 'warning',
    }
  )
    .then(() => {
      // 重置所有记录数据
      resetRecord();

      // 停止计时器
      pause();

      // 重置初始MHB为默认值
      initCash.value = 0;

      ElMessage({
        type: 'success',
        message: '重置记录成功',
      })
    })
    .catch(() => {
      // 用户取消操作
      ElMessage({
        type: 'info',
        message: '已取消重置',
      })
    })
}

const saveRecord = () => {
  if (recordStart.value === 0 || accumulatedTime.value === '00:00:00') {
    ElMessage({
      message: '请先开始/结束计时',
      type: 'warning'
    });
    return;
  }
  const record = {
    start: dayjs(recordStart.value).format('YYYY-MM-DD HH:mm:ss'),
    end: dayjs().format('YYYY-MM-DD HH:mm:ss'),
    time: accumulatedTime.value,
    mhb: netMhb.value,
    point: pointConsumed.value,
    goldPrice: goldPrice.value,
    bags: JSON.stringify(bags.value),
    profit: Number(sumProfit.value),
    sameTimeAccount: sameTimeAccount.value,
    bagsGain: bagsGain.value
  }
  window.ipcRenderer.invoke('db:addRecord', record).then(() => {
    ElMessage({
      message: '记录成功',
      type: 'success'
    });
    resetRecord();
  });
}
</script>

<style scoped>
.today-body {
  display: flex;
  flex-direction: column;
  margin: 16px;
  box-sizing: content-box;
}

.today-grid-header {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(3, 1fr);
  row-gap: 16px;
  column-gap: 16px;
}

.header-border {

  border-radius: var(--el-input-border-radius, var(--el-border-radius-base));
  box-shadow: 0 0 0 1px var(--el-input-border-color, var(--el-border-color)) inset;
}

/* 修改 el-descriptions 内部表格单元格的样式 */
:deep(.el-descriptions__body .el-descriptions__table.is-bordered .el-descriptions__cell) {
  padding: 5px 11px;
}
</style>
