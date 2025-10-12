<template>
  <el-card shadow="never" style="overflow-y: scroll">
    <div style="margin-bottom: 16px;" class="flex items-center">
      <el-button @click="exportPrice" class="mr-2">导出</el-button>
      <el-upload
        class="mr-2"
        action="#"
        :before-upload="handleFileUpload"
        accept=".json"
        :show-file-list="false"
      >
        <el-button>导入</el-button>
      </el-upload>
      <el-button @click="resetPrice" type="danger" plain>重置</el-button>
    </div>
    <el-descriptions
      v-for="type in Object.keys(price)"
      :title="type"
      :column="2"
      border
      style="margin-bottom: 16px;"
    >
      <template #extra>
        <el-button @click="showAddItemDialog(type)">添加</el-button>
      </template>
      <el-descriptions-item
        v-for="name in Object.keys(price[type])"
        :label="name"
      >
        <template #label>
          <div
            style="
              width: 140px;
              display: inline-flex;
              align-items: center;
            ">
            <el-image
              style="width: 32px; height: 32px; margin-right: 6px;flex-shrink: 0;"
              :src="price[type][name].image"
              fit="contain"
              :alt="name"
            />
            <div class="flex-1">{{ name }}</div>
            <el-link type="primary" class="ml-2" v-if="type === '宝石'" @click="showGemDetail(name, price[type][name])">
              <el-icon><MoreFilled /></el-icon>
            </el-link>
            <el-link type="danger" class="ml-2" v-if="price[type][name].id" @click="deleteItem(type, name, price[type][name])">
              <el-icon><DeleteFilled /></el-icon>
            </el-link>
          </div>
        </template>
        <priceInput
          v-model="price[type][name].price"
        />
      </el-descriptions-item>
    </el-descriptions>
  </el-card>

  <el-dialog v-model="gemDetailDialog.visible" :title="gemDetailDialog.title" width="70%">
    <el-table :data="gemDetailDialog.list" style="width: 100%" height="300" >
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="price" label="价格" width="180">
        <template #default="scope">
          <priceInput v-model="scope.row.price" />
        </template>
      </el-table-column>
      <el-table-column prop="count" label="数量" />
    </el-table>
  </el-dialog>

  <el-dialog v-model="addItemDialog.visible" title="添加物品" width="500px">
    <el-form :model="addItemDialog.form" label-width="80px">
      <el-form-item label="物品名称" required>
        <el-input v-model="addItemDialog.form.name" placeholder="请输入物品名称" />
      </el-form-item>
      <el-form-item label="物品价格" required>
        <priceInput v-model="addItemDialog.form.price" />
      </el-form-item>
      <el-form-item label="物品图片">
        <div style="display: flex; gap: 8px; align-items: flex-start;">
          <el-select v-model="addItemDialog.form.image" placeholder="请选择物品图片" filterable style="flex: 1;">
            <el-option
              v-for="image in imageList"
              :key="image"
              :label="image.split('/').pop()?.split('.')[0]"
              :value="image"
            >
              <div style="display: flex; align-items: center;">
                <el-image
                  style="width: 24px; height: 24px; margin-right: 8px;"
                  :src="image"
                  fit="contain"
                />
                {{ image.split('/').pop()?.split('.')[0] }}
              </div>
            </el-option>
          </el-select>
          <el-upload
            :show-file-list="false"
            :before-upload="handleImageUpload"
            accept="image/*"
            action="#"
          >
            <el-button type="primary" plain>
              <el-icon><Plus /></el-icon>
              上传图片
            </el-button>
          </el-upload>
        </div>
        <div v-if="addItemDialog.form.image" style="margin-top: 8px;">
          <span style="font-size: 12px; color: #666; margin-right: 8px;">已选择:</span>
          <el-image
            style="width: 32px; height: 32px; vertical-align: middle; margin-right: 8px;"
            :src="addItemDialog.form.image"
            fit="contain"
          />
          <span style="font-size: 12px; color: #333;">{{ addItemDialog.form.image.split('/').pop()?.split('.')[0] }}</span>
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="addItemDialog.visible = false">取消</el-button>
      <el-button type="primary" @click="saveNewItem">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { onBeforeUnmount, reactive, onMounted, ref } from 'vue';
import { usePrice } from '../hooks/usePrice';
import priceInput from '../components/priceInput.vue';
import { MoreFilled, DeleteFilled, Plus } from '@element-plus/icons-vue';
import { ElMessageBox } from 'element-plus'

const { price, originPrice, init, originResult } = usePrice();

const gemDetailDialog = reactive({
  visible: false,
  title: '',
  item: {} as { price: number; image: string },
  list: [] as { name: string; price: number; count: number }[],
});

const addItemDialog = reactive({
  visible: false,
  currentType: '',
  form: {
    name: '',
    price: 0,
    image: ''
  }
});
const showGemDetail = (name: string, item: { price: number; image: string }) => {
  gemDetailDialog.visible = true;
  gemDetailDialog.title = `宝石详情 - ${name}`;
  gemDetailDialog.item = item;
  let tempList: { name: string; price: number; count: number }[] = [];
  let rate = 2;
  if (name === '星辉石') rate = 3;
  for (let i = 1; i <= 20; i++) {
    let previous = tempList[tempList.length - 1];
    if (name === '五色灵尘') {
      let previousTwo = tempList[tempList.length - 2];
      if (i === 1) {
        tempList.push({
          name: `${i}级${name}`,
          price: item.price,
          count: i,
        });
      } else if (i === 2) {
        tempList.push({
          name: `${i}级${name}`,
          price: item.price,
          count: 2,
        });
      } else {
        tempList.push({
          name: `${i}级${name}`,
          price: 2 * previous.price + previousTwo.price,
          count: 2 * previous.count + previousTwo.count,
        });
      }
    } else {
      if (i === 1) {
        tempList.push({
          name: `${i}级${name}`,
          price: item.price,
          count: i,
        });
      } else {
        tempList.push({
          name: `${i}级${name}`,
          price: rate * previous.price,
          count: rate * previous.count,
        });
      }
    }
  }
  gemDetailDialog.list = tempList;
}

const resetPrice = () => {
  ElMessageBox.confirm('确定要重置价格吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    await window.ipcRenderer.invoke('db:resetPrice');
    init();
  }).catch(() => {
    return;
  });
};

const exportPrice = () => {
  let link = document.createElement('a');
  link.download = 'price.json';
  link.href = URL.createObjectURL(new Blob([JSON.stringify(originResult.value)], { type: 'application/json' }));
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
}

const handleFileUpload = (file: File) => {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target?.result as string);
      await window.ipcRenderer.invoke('db:resetPrice', data);
      init();
    } catch (error) {
      ElMessageBox.alert('导入的文件格式不正确，请检查后重试。', '错误', {
        type: 'error',
      });
    }
  };
  reader.readAsText(file);
  return false; // 阻止默认上传行为
};

const handleImageUpload = async (file: File) => {
  // 验证文件类型
  const allowedTypes = ['image/png', 'image/jpg', 'image/jpeg', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    ElMessageBox.alert('请上传 PNG、JPG、JPEG、GIF 或 WEBP 格式的图片', '提示', { type: 'warning' });
    return false;
  }

  // 验证文件大小 (最大 5MB)
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    ElMessageBox.alert('图片大小不能超过 5MB', '提示', { type: 'warning' });
    return false;
  }

  try {
    // 转换文件为 buffer
    const buffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);

    // 调用后端接口保存图片
    const imagePath = await window.ipcRenderer.invoke('saveImage', {
      fileName: file.name,
      data: Array.from(uint8Array),
      type: file.type
    });

    // 添加到图片列表
    imageList.value.push(imagePath);

    // 自动选择新上传的图片
    addItemDialog.form.image = imagePath;

    ElMessageBox.alert('图片上传成功', '提示', { type: 'success' });
  } catch (error) {
    console.error('上传图片失败:', error);
    ElMessageBox.alert('图片上传失败，请重试', '错误', { type: 'error' });
  }

  return false; // 阻止默认上传行为
};

const showAddItemDialog = (type: string) => {
  addItemDialog.visible = true;
  addItemDialog.currentType = type;
  // 重置表单
  addItemDialog.form.name = '';
  addItemDialog.form.price = 0;
  addItemDialog.form.image = '';
};

const saveNewItem = async () => {
  // 验证表单
  if (!addItemDialog.form.name.trim()) {
    ElMessageBox.alert('请输入物品名称', '提示', { type: 'warning' });
    return;
  }
  if (!addItemDialog.form.image) {
    ElMessageBox.alert('请选择物品图片', '提示', { type: 'warning' });
    return;
  }
  if (addItemDialog.form.price <= 0) {
    ElMessageBox.alert('请输入有效的价格', '提示', { type: 'warning' });
    return;
  }

  try {
    // 调用数据库接口保存新物品
    await window.ipcRenderer.invoke('db:addPrice', {
      name: addItemDialog.form.name.trim(),
      price: addItemDialog.form.price,
      image: addItemDialog.form.image,
      type: addItemDialog.currentType
    });

    // 关闭弹窗
    addItemDialog.visible = false;

    // 刷新数据
    init();

    ElMessageBox.alert('添加成功', '提示', { type: 'success' });
  } catch (error) {
    ElMessageBox.alert('添加失败，请重试', '错误', { type: 'error' });
  }
};

const deleteItem = (type: string, name: string, item: { id: number; price: number; image: string }) => {
  ElMessageBox.confirm(`确定要删除物品"${name}"吗？`, '删除确认', {
    confirmButtonText: '确定删除',
    cancelButtonText: '取消',
    type: 'warning',
    dangerouslyUseHTMLString: false
  }).then(async () => {
    try {
      // 调用数据库接口删除物品
      await window.ipcRenderer.invoke('db:deletePrice', item.id);
      
      // 刷新数据
      init();
      
      ElMessageBox.alert('删除成功', '提示', { type: 'success' });
    } catch (error) {
      console.error('删除物品失败:', error);
      ElMessageBox.alert('删除失败，请重试', '错误', { type: 'error' });
    }
  }).catch(() => {
    // 用户取消删除
    return;
  });
};

const imageList = ref([] as string[]);
onMounted(async () => {
  // 加载默认图片
  const files = import.meta.glob('/public/*');
  const defaultImages = Object.keys(files).map((key) => key.replace('/public', '.')).filter((file) => file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg'));

  // 加载用户上传的图片
  try {
    const uploadedImages = await window.ipcRenderer.invoke('getUserImages');
    imageList.value = [...defaultImages, ...uploadedImages];
  } catch (error) {
    console.error('加载用户图片失败:', error);
    imageList.value = defaultImages;
  }
});

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
