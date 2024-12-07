const defaultDb = {
  price: [
    // 宝石
    { id: 1, name: '黑宝石', price: 100, type: '宝石', image: './heibaoshi.png' },
    { id: 2, name: '红玛瑙', price: 100, type: '宝石', image: './hongmanao.png' },
    { id: 3, name: '舍利子', price: 100, type: '宝石', image: './shelizi.png' },
    { id: 4, name: '太阳石', price: 100, type: '宝石', image: './taiyangshi.png' },
    { id: 5, name: '月亮石', price: 100, type: '宝石', image: './yueliangshi.png' },
    { id: 6, name: '光芒石', price: 100, type: '宝石', image: './guangmangshi.png' },
    { id: 7, name: '翡翠石', price: 100, type: '宝石', image: './feicuishi.png' },
    // 强化
    { id: 9, name: '强化石', price: 100, type: '强化', image: './qianghuashi.png' },
    // 五宝
    { id: 10, name: '避水珠', price: 100, type: '五宝', image: './bishuizhu.png' },
    { id: 11, name: '龙鳞', price: 100, type: '五宝', image: './longlin.png' },
    { id: 12, name: '夜光珠', price: 100, type: '五宝', image: './yeguangzhu.png' },
    { id: 13, name: '金刚石', price: 100, type: '五宝', image: './jingangshi.png' },
    { id: 14, name: '定魂珠', price: 100, type: '五宝', image: './dinghunzhu.png' },
    { id: 15, name: '特赦令牌', price: 100, type: '五宝', image: './teshelingpai.png' },
    // 如意丹
    { id: 16, name: '金', price: 100, type: '如意丹', image: './ruyidan.png' },
    { id: 17, name: '木', price: 100, type: '如意丹', image: './ruyidan.png' },
    { id: 18, name: '水', price: 100, type: '如意丹', image: './ruyidan.png' },
    { id: 19, name: '火', price: 100, type: '如意丹', image: './ruyidan.png' },
    { id: 20, name: '土', price: 100, type: '如意丹', image: './ruyidan.png' },
    // 洗炼
    { id: 21, name: '金柳露', price: 100, type: '洗炼', image: './jinliulu.png' },
    { id: 22, name: '超级金柳露', price: 100, type: '洗炼', image: './chaojijinliulu.png' },
    { id: 23, name: '净瓶玉露', price: 100, type: '洗炼', image: './jingpingyulu.png' },
    { id: 24, name: '超级净瓶玉露', price: 100, type: '洗炼', image: './chaojijingpingyulu.png' },
    { id: 25, name: '月华露', price: 100, type: '洗炼', image: './yuehualu.png' },
    // 种子
    { id: 26, name: '摇钱树树苗', price: 100, type: '种子', image: './yaoqianshushumiao.png' },
    { id: 27, name: '2级植物的种子', price: 100, type: '种子', image: './zhiwudezhongzi.png' },
    { id: 28, name: '3级植物的种子', price: 100, type: '种子', image: './zhiwudezhongzi.png' },
    { id: 29, name: '4级植物的种子', price: 100, type: '种子', image: './zhiwudezhongzi.png' },
    // 环装
    { id: 30, name: '60武器', price: 100, type: '环装', image: './60wuqi.png' },
    { id: 31, name: '60装备', price: 100, type: '环装', image: './60huan.png' },
    { id: 32, name: '70武器', price: 100, type: '环装', image: './70wuqi.png' },
    { id: 33, name: '70装备', price: 100, type: '环装', image: './70huan.png' },
    { id: 34, name: '80武器', price: 100, type: '环装', image: './80wuqi.png' },
    { id: 35, name: '80装备', price: 100, type: '环装', image: './80huan.png' },
    // 珍珠
    { id: 36, name: '50珍珠', price: 100, type: '珍珠', image: './zhenzhu.png' },
    { id: 37, name: '60珍珠', price: 100, type: '珍珠', image: './zhenzhu.png' },
    { id: 38, name: '70珍珠', price: 100, type: '珍珠', image: './zhenzhu.png' },
    { id: 39, name: '80珍珠', price: 100, type: '珍珠', image: './zhenzhu.png' },
    { id: 40, name: '90珍珠', price: 100, type: '珍珠', image: './zhenzhu.png' },
    { id: 41, name: '100珍珠', price: 100, type: '珍珠', image: './zhenzhu.png' },
    { id: 42, name: '110珍珠', price: 100, type: '珍珠', image: './zhenzhu.png' },
    { id: 43, name: '120珍珠', price: 100, type: '珍珠', image: './zhenzhu.png' },
    { id: 44, name: '130珍珠', price: 100, type: '珍珠', image: './zhenzhu.png' },
    // 符石
    { id: 45, name: '1级符石', price: 100, type: '符石', image: './1jifushi.png' },
    { id: 46, name: '符石卷轴', price: 100, type: '符石', image: './fushijuanzhou.png' },
    // 灵饰
    { id: 47, name: '60戒指', price: 100, type: '灵饰', image: './lingshizhinanshu.png' },
    { id: 48, name: '60耳饰', price: 100, type: '灵饰', image: './lingshizhinanshu.png' },
    { id: 49, name: '60手镯', price: 100, type: '灵饰', image: './lingshizhinanshu.png' },
    { id: 50, name: '60配饰', price: 100, type: '灵饰', image: './lingshizhinanshu.png' },
    { id: 51, name: '80戒指', price: 100, type: '灵饰', image: './lingshizhinanshu.png' },
    { id: 52, name: '80耳饰', price: 100, type: '灵饰', image: './lingshizhinanshu.png' },
    { id: 53, name: '80手镯', price: 100, type: '灵饰', image: './lingshizhinanshu.png' },
    { id: 54, name: '80配饰', price: 100, type: '灵饰', image: './lingshizhinanshu.png' },
    { id: 55, name: '100戒指', price: 100, type: '灵饰', image: './lingshizhinanshu.png' },
    { id: 56, name: '100耳饰', price: 100, type: '灵饰', image: './lingshizhinanshu.png' },
    { id: 57, name: '100手镯', price: 100, type: '灵饰', image: './lingshizhinanshu.png' },
    { id: 58, name: '100配饰', price: 100, type: '灵饰', image: './lingshizhinanshu.png' },
  ],
  settings: {
    goldPrice: 182,
    pointPrice: 17000,
    sameTimeAccount: 5,
    initCash: 200000,
  },
  records: []
}

export default defaultDb;
