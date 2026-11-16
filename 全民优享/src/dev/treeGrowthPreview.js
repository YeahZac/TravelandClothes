/**
 * 【仅开发态预览】能量树成长演示数据与状态构造。
 * 与 jar / treeService / 正式种植 API 完全隔离，禁止用于正式业务逻辑。
 * 仅当小程序 envVersion === 'develop' 时暴露入口；体验版/正式版永不开启。
 */

export const PREVIEW_PHASES = [
  { id: 'seed', name: '种子', tip: '罐里静静躺着一颗种子', nutrition: 0, energyPerWave: 8 },
  { id: 'sprout', name: '发芽', tip: '破土冒出嫩芽', nutrition: 22, energyPerWave: 12 },
  { id: 'seedling', name: '小苗', tip: '叶片舒展，小苗立起来了', nutrition: 55, energyPerWave: 18 },
  { id: 'trunk', name: '树干', tip: '主干拔高，越长越粗壮', nutrition: 110, energyPerWave: 25 },
  { id: 'flower', name: '开花', tip: '枝头开出花朵', nutrition: 180, energyPerWave: 32 },
  { id: 'fruit', name: '结果', tip: '果实渐熟，可以期待收获', nutrition: 270, energyPerWave: 40 },
  { id: 'mature', name: '成树', tip: '枝繁叶茂，进入成熟周期', nutrition: 360, energyPerWave: 48 },
]

/** 演示用树种（复制视觉字段，不走后端 catalog） */
export const PREVIEW_SEEDS = [
  {
    id: 'seed_elm',
    name: '榆钱树',
    fruitName: '榆钱',
    theme: 'elm',
    leafTone: '#7FA67A',
    trunkTone: '#8B7355',
    flowerTone: '#C9D4A8',
    fruitTone: '#A8C070',
    playTag: '均衡教学',
    yieldMult: 1,
  },
  {
    id: 'seed_peach',
    name: '桃夭',
    fruitName: '水蜜桃',
    theme: 'peach',
    leafTone: '#7FA67A',
    trunkTone: '#8B5A4A',
    flowerTone: '#E8A0B5',
    fruitTone: '#E87A6B',
    playTag: '开花秀',
    yieldMult: 1.15,
  },
  {
    id: 'seed_bamboo',
    name: '节节高',
    fruitName: '竹笋',
    theme: 'bamboo',
    leafTone: '#6B9B6E',
    trunkTone: '#8FBC8F',
    flowerTone: '#D4E6C3',
    fruitTone: '#C4D7A4',
    playTag: '连签友好',
    yieldMult: 1.25,
    checkinBonusNutrition: 8,
  },
  {
    id: 'seed_pine',
    name: '苍松',
    fruitName: '松果',
    theme: 'pine',
    leafTone: '#4A6B4E',
    trunkTone: '#6B5344',
    flowerTone: '#A8B890',
    fruitTone: '#8B6B4A',
    playTag: '抗偷抗虫',
    yieldMult: 1.4,
    stealResist: 0.25,
    eventResist: 0.7,
  },
  {
    id: 'seed_ginkgo',
    name: '金扇',
    fruitName: '白果',
    theme: 'ginkgo',
    leafTone: '#D4B24A',
    trunkTone: '#8B7340',
    flowerTone: '#E8D48A',
    fruitTone: '#C9A036',
    playTag: '落叶爆发',
    yieldMult: 1.55,
    leafSunlightBonus: 4,
  },
  {
    id: 'seed_maple',
    name: '霜红枫',
    fruitName: '枫翅',
    theme: 'maple',
    leafTone: '#C45A3A',
    trunkTone: '#6B4030',
    flowerTone: '#E8A070',
    fruitTone: '#A84828',
    playTag: '日掉丰产',
    yieldMult: 1.75,
    dailyDropMin: 10,
    dailyDropMax: 28,
  },
  {
    id: 'seed_paulownia',
    name: '紫云桐',
    fruitName: '桐果',
    theme: 'paulownia',
    leafTone: '#6A7A9B',
    trunkTone: '#5A4A6B',
    flowerTone: '#B8A0D8',
    fruitTone: '#8A70B0',
    playTag: '收果暴击',
    yieldMult: 2,
  },
]

/** 仅开发者工具 / 开发版；trial、release 恒为 false */
export function isTreePreviewEnabled() {
  try {
    if (typeof uni === 'undefined' || !uni.getAccountInfoSync) return false
    const info = uni.getAccountInfoSync()
    const v = info && info.miniProgram && info.miniProgram.envVersion
    return v === 'develop'
  } catch (e) {
    return false
  }
}

export function buildPreviewTree(seedId, phaseIndex) {
  const seed =
    PREVIEW_SEEDS.find((s) => s.id === seedId) || PREVIEW_SEEDS[0]
  const idx = Math.max(0, Math.min(PREVIEW_PHASES.length - 1, Number(phaseIndex) || 0))
  const phase = PREVIEW_PHASES[idx]
  const next = PREVIEW_PHASES[idx + 1] || null
  const progress =
    PREVIEW_PHASES.length <= 1 ? 1 : Math.round((idx / (PREVIEW_PHASES.length - 1)) * 100)
  const dailyDrop =
    seed.theme === 'maple' || (seed.dailyDropMax && phase.id !== 'seed')
      ? { remaining: 12, tip: '演示日掉营养' }
      : null

  return {
    enabled: true,
    __preview: true,
    seedId: seed.id,
    seed: { ...seed },
    phase: phase.id,
    phaseName: phase.name,
    phaseTip: phase.tip,
    nutrition: phase.nutrition,
    progress,
    cycle: 1,
    energyPerWave: Math.round(phase.energyPerWave * (seed.yieldMult || 1)),
    yieldMult: seed.yieldMult || 1,
    canHarvestFruit: phase.id === 'mature' || phase.id === 'fruit',
    fruitName: seed.fruitName,
    playTag: seed.playTag,
    nextPhase: next
      ? { id: next.id, name: next.name, nutritionLeft: Math.max(0, next.nutrition - phase.nutrition), daysLeft: 0 }
      : null,
    dailyDrop,
    inventory: PREVIEW_SEEDS.map((s) => ({ id: s.id, seedId: s.id, qty: 1, owned: true, name: s.name })),
    seedsCatalog: PREVIEW_SEEDS.map((s) => ({ ...s, owned: true, qty: 1, obtain: 'free' })),
  }
}
