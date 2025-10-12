const defaultDb = {
  price: [
    // 宝石
    { id: 1, name: '黑宝石', price: 170000, type: '宝石', image: './heibaoshi.png' },
    { id: 2, name: '红玛瑙', price: 90000, type: '宝石', image: './hongmanao.png' },
    { id: 3, name: '舍利子', price: 100000, type: '宝石', image: './shelizi.png' },
    { id: 4, name: '太阳石', price: 80000, type: '宝石', image: './taiyangshi.png' },
    { id: 5, name: '月亮石', price: 60000, type: '宝石', image: './yueliangshi.png' },
    { id: 6, name: '光芒石', price: 30000, type: '宝石', image: './guangmangshi.png' },
    { id: 7, name: '翡翠石', price: 10000, type: '宝石', image: './feicuishi.png' },
    { id: 8, name: '星辉石', price: 150000, type: '宝石', image: './xinghuishi.png' },
    { id: 9, name: '五色灵尘', price: 400000, type: '宝石', image: './wuselingchen.png' },
    // 五宝
    { id: 10, name: '避水珠', price: 80000, type: '五宝', image: './bishuizhu.png' },
    { id: 11, name: '龙鳞', price: 520000, type: '五宝', image: './longlin.png' },
    { id: 12, name: '夜光珠', price: 980000, type: '五宝', image: './yeguangzhu.png' },
    { id: 13, name: '金刚石', price: 1080000, type: '五宝', image: './jingangshi.png' },
    { id: 14, name: '定魂珠', price: 1080000, type: '五宝', image: './dinghunzhu.png' },
    { id: 15, name: '特赦令牌', price: 3770000, type: '五宝', image: './teshelingpai.png' },
    // 如意丹
    { id: 16, name: '金', price: 100, type: '如意丹', image: './ruyidan.png' },
    { id: 17, name: '木', price: 100, type: '如意丹', image: './ruyidan.png' },
    { id: 18, name: '水', price: 100, type: '如意丹', image: './ruyidan.png' },
    { id: 19, name: '火', price: 100, type: '如意丹', image: './ruyidan.png' },
    { id: 20, name: '土', price: 100, type: '如意丹', image: './ruyidan.png' },
    // 洗炼
    { id: 21, name: '金柳露', price: 26000, type: '洗炼', image: './jinliulu.png' },
    { id: 22, name: '超级金柳露', price: 250000, type: '洗炼', image: './chaojijinliulu.png' },
    { id: 23, name: '净瓶玉露', price: 90000, type: '洗炼', image: './jingpingyulu.png' },
    { id: 24, name: '超级净瓶玉露', price: 500000, type: '洗炼', image: './chaojijingpingyulu.png' },
    { id: 25, name: '月华露', price: 70000, type: '洗炼', image: './yuehualu.png' },
    // 种子
    { id: 26, name: '摇钱树树苗', price: 450000, type: '种子', image: './yaoqianshushumiao.png' },
    { id: 27, name: '2级植物的种子', price: 40000, type: '种子', image: './zhiwudezhongzi.png' },
    { id: 28, name: '3级植物的种子', price: 40000, type: '种子', image: './zhiwudezhongzi.png' },
    { id: 29, name: '4级植物的种子', price: 500000, type: '种子', image: './zhiwudezhongzi.png' },
    // 环装
    { id: 30, name: '60武器', price: 220000, type: '环装', image: './60wuqi.png' },
    { id: 31, name: '60装备', price: 220000, type: '环装', image: './60huan.png' },
    { id: 32, name: '70武器', price: 110000, type: '环装', image: './70wuqi.png' },
    { id: 33, name: '70装备', price: 90000, type: '环装', image: './70huan.png' },
    { id: 34, name: '80武器', price: 520000, type: '环装', image: './80wuqi.png' },
    { id: 35, name: '80装备', price: 480000, type: '环装', image: './80huan.png' },
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
    { id: 45, name: '1级符石', price: 100000, type: '符石', image: './1jifushi.png' },
    { id: 46, name: '符石卷轴', price: 120000, type: '符石', image: './fushijuanzhou.png' },
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
    { id: 59, name: '60晶石', price: 100, type: '灵饰', image: './yuanlingjingshi.png' },
    { id: 60, name: '80晶石', price: 100, type: '灵饰', image: './yuanlingjingshi.png' },
    { id: 61, name: '100晶石', price: 100, type: '灵饰', image: './yuanlingjingshi.png' },
    // 其他
    { id: 62, name: '修炼果', price: 780000, type: '其他', image: './xiulianguo.png' },
    { id: 63, name: '海马', price: 170000, type: '其他', image: './haima.png' },
    { id: 64, name: '彩果', price: 300000, type: '其他', image: './caiguo.png' },
    { id: 65, name: '强化石', price: 97000, type: '其他', image: './qianghuashi.png' },
    { id: 66, name: '仙露小丸子', price: 120000, type: '其他', image: './xianluxiaowanzi.png' },
    { id: 67, name: '金银锦盒', price: 20000, type: '其他', image: './jinyingjinhe.png' },
    { id: 68, name: '三界悬赏令', price: 110000, type: '其他', image: './sanjietongjiling.png' },
    { id: 70, name: '80附魔', price: 10000000, type: '其他', image: './fumobaozhu.png' },
    { id: 71, name: '90附魔', price: 100, type: '其他', image: './fumobaozhu.png' },
    { id: 72, name: '100附魔', price: 100, type: '其他', image: './fumobaozhu.png' },
    { id: 73, name: '110附魔', price: 100, type: '其他', image: './fumobaozhu.png' },
    { id: 74, name: '120附魔', price: 100, type: '其他', image: './fumobaozhu.png' },
    { id: 75, name: '130附魔', price: 100, type: '其他', image: './fumobaozhu.png' },
    // 低级兽决
    { id: 76, name: '必杀', price: 100, type: '兽决', image: './moshouyaojue.png' },
    { id: 77, name: '连击', price: 100, type: '兽决', image: './moshouyaojue.png' },
    { id: 78, name: '吸血', price: 100, type: '兽决', image: './moshouyaojue.png' },
    { id: 79, name: '夜战', price: 100, type: '兽决', image: './moshouyaojue.png' },
    { id: 80, name: '偷袭', price: 100, type: '兽决', image: './moshouyaojue.png' },
    // 高级兽决
    { id: 81, name: '高级必杀', price: 100, type: '高级兽决', image: './gaojimoshouyaojue.png' },
    { id: 82, name: '高级连击', price: 100, type: '高级兽决', image: './gaojimoshouyaojue.png' },
    { id: 83, name: '高级吸血', price: 100, type: '高级兽决', image: './gaojimoshouyaojue.png' },
    { id: 84, name: '高级夜战', price: 100, type: '高级兽决', image: './gaojimoshouyaojue.png' },
    { id: 85, name: '高级偷袭', price: 100, type: '高级兽决', image: './gaojimoshouyaojue.png' },
    // 低级内丹
    { id: 86, name: '迅敏', price: 100, type: '内丹', image: './zhaohuanshouneidan.png' },
    // 高级内丹
    { id: 87, name: '催心浪', price: 100, type: '高内丹', image: './gaojizhaohuanshouneidan.png' },
    // 召唤兽资质
    { id: 88, name: '攻击元宵', price: 100, type: '召唤兽资质', image: './yuanxiao.png' },
    // { id: 89, name: '练兽真经', price: 100, type: '召唤兽资质', image: '' },
    // 炼妖石 图册
    { id: 90, name: '95炼药石', price: 100, type: '炼妖石图册', image: './lianyaoshi.png' },
    { id: 91, name: '伤害灵石', price: 100, type: '炼妖石图册', image: './jingpolingshi.png' },
    // 装备 铁
    { id: 92, name: '100铁', price: 100, type: '装备铁', image: './bailianjingtie.png' },
    { id: 93, name: '100项链', price: 100, type: '装备铁', image: './zhizaozhinanshu.png' }
  ],
  settings: {
    goldPrice: 202,
    pointPrice: 15500,
    sameTimeAccount: 5,
    initCash: 0,
  },
  records: []
}

export default defaultDb;
