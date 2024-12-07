import { defineStore } from "pinia";
import { ref } from "vue";
import { CountablePriceItem } from "../hooks/usePrice";

export const useTodayStore = defineStore('today', () => {

  const bags = ref<CountablePriceItem[]>([])
  const timeStart = ref(0)
  const endCash = ref(0)
  const accumulatedTime = ref('00:00:00')
  const recordStart = ref(0)

  const resetRecord = () => {
    bags.value = []
    timeStart.value = 0
    endCash.value = 0
    accumulatedTime.value = '00:00:00'
    recordStart.value = 0
  }

  return {
    bags,
    timeStart,
    endCash,
    accumulatedTime,
    resetRecord,
    recordStart
  }
})
