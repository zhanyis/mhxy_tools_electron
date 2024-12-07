<template>
  <div class="today-body">
    <div class="today-grid-header">
      <div class="col-span-2 row-span-3 header-border pl-2 flex flex-col justify-around">
        <p>在线时长: {{ timeConsumed }}</p>
        <p>物品累计收益: {{ bagsGain }}</p>
        <p>mhb累计收益: {{ netMhb }}</p>
        <p>点卡消费: {{ pointConsumed }}</p>
        <p>换算现金收益: {{ sumProfit }}元</p>
      </div>
      <div class="header-border pl-2 flex items-center">金价</div>
      <div><el-input v-model="goldPrice"><template #prepend>3000w</template></el-input></div>
      <div class="header-border pl-2 flex items-center">点卡</div>
      <div><el-input v-model="pointPrice"></el-input></div>
      <div class="header-border pl-2 flex items-center">同时打开账号</div>
      <div>
        <el-select v-model="sameTimeAccount">
          <el-option v-for="item in 8" :label="item" :value="item"></el-option>
        </el-select>
      </div>
    </div>
    <div class="flex mt-4">
      <div class="min-w-20">初始mhb</div>
      <el-input v-model="initCash"></el-input>
      <el-button class="ml-2" type="primary" plain @click="startTimer" v-if="timeStart === 0">开始计时</el-button>
      <el-button class="ml-2" type="danger" plain @click="endTimer" v-else>结束计时</el-button>
    </div>
    <div class="flex mt-2 mb-4 items-center">
      <div class="min-w-20">结束mhb</div>
      <el-input v-model="endCash"></el-input>
      <el-button class="ml-2" type="success" plain @click="saveRecord">记录收益</el-button>
      <el-button class="ml-2" type="warning" plain style="margin-left: 0.5rem" @click="resetRecordConfirm">重置记录</el-button>
    </div>
    <itemsTransfer v-model:bags="bags"/>
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

const { goldPrice, pointPrice, sameTimeAccount, initCash } = useSettings();

const { bags, timeStart, endCash, accumulatedTime, recordStart } = storeToRefs(useTodayStore());
const { resetRecord } = useTodayStore();

const { timestamp, pause, resume } = useTimestamp({ controls: true })

const netMhb = computed(() => {
  return endCash.value - initCash.value;
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
    '确定要重置现有记录吗？',
    '警告',
    {
      confirmButtonText: 'OK',
      cancelButtonText: 'Cancel',
      type: 'warning',
    }
  )
    .then(() => {
      ElMessage({
        type: 'success',
        message: '重置记录成功',
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
</style>
