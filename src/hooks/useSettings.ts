import { onMounted, ref, computed } from "vue"

export const useSettings = () => {

  const innerGoldPrice = ref(182);
  const innerPointPrice = ref(17000);
  const innerSameTimeAccount = ref(5);
  const innerInitCash = ref(200000);

  const goldPrice = computed({
    get: () => {
      return innerGoldPrice.value;
    },
    set: (value) => {
      innerGoldPrice.value = Number(value);
      window.ipcRenderer.invoke('db:setSettings', 'goldPrice', Number(value));
    }
  })

  const pointPrice = computed({
    get: () => {
      return innerPointPrice.value;
    },
    set: (value) => {
      innerPointPrice.value = Number(value);
      window.ipcRenderer.invoke('db:setSettings', 'pointPrice', Number(value));
    }
  })

  const sameTimeAccount = computed({
    get: () => {
      return innerSameTimeAccount.value;
    },
    set: (value) => {
      innerSameTimeAccount.value = Number(value);
      window.ipcRenderer.invoke('db:setSettings', 'sameTimeAccount', Number(value));
    }
  })

  const initCash = computed({
    get: () => {
      return innerInitCash.value;
    },
    set: (value) => {
      innerInitCash.value = Number(value);
      window.ipcRenderer.invoke('db:setSettings', 'initCash', Number(value));
    }
  })

  onMounted(() => {
    window.ipcRenderer.invoke('db:getSettings').then((res) => {
      innerGoldPrice.value = res.goldPrice;
      innerPointPrice.value = res.pointPrice;
      innerSameTimeAccount.value = res.sameTimeAccount;
      innerInitCash.value = res.initCash;
    });
  });

  return {
    goldPrice,
    pointPrice,
    sameTimeAccount,
    initCash
  }
}
