import { onMounted, ref } from "vue"

export interface PriceItem {
  name: string;
  price: number;
  image: string;
  id: number;
  type: string;
}

export interface CountablePriceItem extends PriceItem {
  count: number;
}

export const usePrice = () => {

  interface PriceType {
    [name: string]: PriceItem;
  }

  interface Price {
    [type: string]: PriceType;
  }

  const price = ref<Price>({});

  const originPrice = ref<{ [name: string]: number }>({});

  const originResult = ref< PriceItem[]>([]);

  onMounted(() => {
    window.ipcRenderer.invoke('db:getPrice').then((res) => {
      console.log('test from price', res);
      const typeMap: Price = {};
      res.forEach((item: PriceItem) => {
        if (!typeMap[item.type]) {
          typeMap[item.type] = {};
        }
        typeMap[item.type][item.name] = item;
        originPrice.value[item.name] = item.price;
      });
      price.value = typeMap;
      originResult.value = res;
    });
  });

  return {
    price,
    originPrice,
    originResult,
  }
}
