/** 可售：仅景区入园。其余内容仅介绍，不进入结算。 */
const SELLABLE = { ticket: 1, free: 1 }

const TYPE_LABEL = {
  ticket: '入园',
  free: '免费通行',
  hotel: '住宿参考',
  show: '活动演出',
  rent: '换装参考',
  food: '美食参考',
  car: '交通参考',
  garment: '形制介绍'
}

const GROUP_TITLE = {
  ticket: '入园通行',
  free: '免费通行',
  hotel: '周边住宿参考',
  show: '活动演出介绍',
  rent: '换装参考',
  food: '周边美食参考',
  car: '交通参考'
}

function canSell(type) {
  return !!SELLABLE[String(type || '')]
}

function typeLabel(type) {
  return TYPE_LABEL[type] || '介绍'
}

function groupTitle(type) {
  return GROUP_TITLE[type] || TYPE_LABEL[type] || type || '相关'
}

module.exports = { SELLABLE, TYPE_LABEL, GROUP_TITLE, canSell, typeLabel, groupTitle }
