const COS_BASE = 'https://7072-prod-d7gnz9s0j20275c05-1492159324.cos.ap-shanghai.myqcloud.com/mock'
const AVATARS = ['avatar-01.jpg', 'avatar-02.jpg', 'icon-hanfu.jpg', 'garment-mamian.jpg', 'garment-yuanling.jpg']
const PHOTOS = [
  'banner-guangzhou.jpg', 'banner-guilin.jpg', 'banner-dunhuang.jpg',
  'spot-yuyin.jpg', 'spot-chen.jpg', 'spot-xiangbi.jpg', 'spot-lizhiwan.jpg',
  'spot-liangjiang.jpg', 'spot-yangshuo.jpg', 'spot-mogao.jpg', 'spot-yangguan.jpg',
  'spot-shazhou.jpg', 'spot-baiyun.jpg', 'garment-ruqun.jpg', 'garment-mamian.jpg',
  'garment-yuanling.jpg', 'garment-beizi.jpg', 'garment-qixiong.jpg', 'event-opening.jpg',
  'checkin-chen.jpg', 'checkin-xiangbi.jpg', 'checkin-yuequan.jpg'
]

function img(name) {
  return `${COS_BASE}/${name}`
}

function avatar(i) {
  return img(AVATARS[i % AVATARS.length])
}

function postImgs(i) {
  const count = (i % 3) + 1
  const list = []
  for (let j = 0; j < count; j++) list.push(img(PHOTOS[(i + j) % PHOTOS.length]))
  return list
}

async function run(db) {
  const r = { users: 0, posts: 0, comments: 0, likes: 0, conversations: 0, messages: 0, notifications: 0, orders: 0, quizRecords: 0 }
  const conn = await db.getConnection()
  try {
    const [[{ cnt }]] = await conn.query("SELECT COUNT(*) AS cnt FROM users WHERE openid LIKE 'mock_%'")
    if (cnt >= 20) {
      r.skipped = true
      return r
    }
    await mockUsers(conn, r)
    await mockPosts(conn, r)
    await mockComments(conn, r)
    await mockLikes(conn, r)
    await mockConversations(conn, r)
    await mockNotifications(conn, r)
    await mockOrders(conn, r)
    await mockQuizRecords(conn, r)
  } finally {
    conn.release()
  }
  return r
}

async function mockUsers(conn, r) {
  const names = ['云溪','青萝','墨白','素心','月华','竹影','清风','落霞','听雨','望舒','兰舟','雪晴','疏影','晚吟','朝露','寒烟','拾光','知秋','南风','北望']
  for (let i = 0; i < names.length; i++) {
    const openid = 'mock_' + (i + 1)
    const [ex] = await conn.query('SELECT id FROM users WHERE openid=?', [openid])
    if (ex.length > 0) continue
    const [u] = await conn.query(
      'INSERT INTO users (openid,nickname,avatar_url,phone) VALUES (?,?,?,?)',
      [openid, names[i], avatar(i), '138' + String(10000000+i*137).slice(0,8)])
    const growth = Math.floor(Math.random() * 8000)
    const level = growth >= 8000 ? 4 : growth >= 3000 ? 3 : growth >= 1000 ? 2 : growth >= 300 ? 1 : 0
    const card = Math.random() > 0.6 ? 1 : 0
    await conn.query('INSERT INTO members (user_id,growth_value,level,card_status) VALUES (?,?,?,?)', [u.insertId, growth, card ? level : 0, card])
    r.users++
  }
}

async function mockPosts(conn, r) {
  const [spots] = await conn.query('SELECT id,name FROM spots WHERE status=1 LIMIT 5')
  const templates = [
    { type: 'checkin', content: '今日打卡余荫山房，曲廊回转，褙子正合适。园林幽深，人少好出片。' },
    { type: 'checkin', content: '陈家祠砖雕太精细了！马面裙在砖雕前特别稳，避开高峰人流就好。' },
    { type: 'guide', content: '新手汉服出行清单：选对形制、看场地、提摆过门槛、别穿曳地裙爬山。' },
    { type: 'hanfu', content: '齐胸襦裙在两江四湖夜色里绝了，但披帛一定要别牢，江风大。' },
    { type: 'checkin', content: '月牙泉日落，圆领袍在沙地里太飒了。记得换平底鞋，宽摆会灌沙。' },
    { type: 'food', content: '沙州夜市香囊手作摊位，买了一个敦煌纹样的，配褙子刚好。' },
    { type: 'checkin', content: '荔枝湾灯会，马面裙提摆上石桥，骑楼廊道袖不要横扫。' },
    { type: 'guide', content: '深衣讲学对照莫高窟壁画衣纹，袖垂腰稳，窟内禁止拍照。' },
    { type: 'hanfu', content: '曲裾绕襟数层，典礼感强，但步幅要小。陈家祠平地合适。' },
    { type: 'checkin', content: '漓江竹筏上穿襦裙，船晃裙不动，短摆比齐胸安全。两岸峰丛绝了。' }
  ]
  const [members] = await conn.query('SELECT m.id FROM members m JOIN users u ON m.user_id=u.id')
  for (let i = 0; i < 50; i++) {
    const tpl = templates[i % templates.length]
    const member = members[i % members.length]
    const spot = spots[i % spots.length]
    const imgs = postImgs(i)
    await conn.query(
      'INSERT INTO posts (member_id,type,content,images,location,scene_id,likes,comments,is_official,status) VALUES (?,?,?,?,?,?,?,?,?,1)',
      [member.id, tpl.type, tpl.content, JSON.stringify(imgs), spot?.name||'广州', spot?.id||null, Math.floor(Math.random()*200), Math.floor(Math.random()*30), i%7===0?1:0])
    r.posts++
  }
}

async function mockComments(conn, r) {
  const texts = ['太美了！','求形制名','这个角度绝了','下次一起去','收藏了','马面好稳','沙地穿圆领袍确实飒','灯会人好多吧','披帛别牢很重要','曲裾步幅确实要小']
  const [posts] = await conn.query('SELECT id FROM posts WHERE status=1')
  const [members] = await conn.query('SELECT id FROM members')
  for (let i = 0; i < 100; i++) {
    await conn.query('INSERT INTO comments (member_id,post_id,content,status) VALUES (?,?,?,1)',
      [members[i%members.length].id, posts[i%posts.length].id, texts[i%texts.length]])
    r.comments++
  }
}

async function mockLikes(conn, r) {
  const [posts] = await conn.query('SELECT id FROM posts WHERE status=1')
  const [members] = await conn.query('SELECT id FROM members')
  for (let i = 0; i < 200; i++) {
    try {
      await conn.query('INSERT INTO likes (member_id,post_id) VALUES (?,?)', [members[(i+3)%members.length].id, posts[i%posts.length].id])
      r.likes++
    } catch (e) {}
  }
}

async function mockConversations(conn, r) {
  const [members] = await conn.query('SELECT m.id,u.nickname,u.avatar_url FROM members m JOIN users u ON m.user_id=u.id LIMIT 10')
  const texts = ['你好，请问景区怎么去？','褙子在哪租的？','下次灯会一起去吧','你的马面裙好好看','求链接','周末有约吗','谢谢分享','收藏了']
  for (let i = 0; i < 10; i++) {
    const m = members[i], t = members[(i+1)%members.length]
    const [c] = await conn.query(
      'INSERT INTO conversations (member_id,target_type,target_id,target_name,target_avatar,last_message,unread) VALUES (?,?,?,?,?,?,?)',
      [m.id, 'user', t.id, t.nickname, t.avatar_url, texts[i%texts.length], Math.floor(Math.random()*5)])
    for (let j = 0; j < 3; j++) {
      await conn.query('INSERT INTO chat_messages (conversation_id,sender_id,content,is_read) VALUES (?,?,?,?)',
        [c.insertId, j%2===0?m.id:t.id, texts[(i+j)%texts.length], j<2?1:0])
      r.messages++
    }
    r.conversations++
  }
}

async function mockNotifications(conn, r) {
  const [members] = await conn.query('SELECT id FROM members')
  const types = [
    { type: 'like', title: '有人赞了你的动态' },
    { type: 'comment', title: '有人评论了你' },
    { type: 'fan', title: '你有了新粉丝' },
    { type: 'system', title: '欢迎加入同袍会' },
    { type: 'order', title: '你的订单已支付' },
    { type: 'benefit', title: '你的年卡权益已到账' }
  ]
  for (let i = 0; i < 30; i++) {
    const n = types[i%types.length]
    await conn.query('INSERT INTO notifications (member_id,type,title,content,is_read) VALUES (?,?,?,?,?)',
      [members[i%members.length].id, n.type, n.title, n.title+'，点击查看详情', i%3===0?0:1])
    r.notifications++
  }
}

async function mockOrders(conn, r) {
  const [members] = await conn.query('SELECT id FROM members WHERE card_status=1')
  const types = ['card','ticket','hotel','rent','show']
  for (let i = 0; i < 20 && i < members.length; i++) {
    const no = 'OD' + Date.now() + i
    await conn.query('INSERT INTO orders (order_no,member_id,type,amount,status,paid_at) VALUES (?,?,?,?,1,NOW())',
      [no, members[i%members.length].id, types[i%types.length], Math.floor(Math.random()*50000)+1000])
    r.orders++
  }
}

async function mockQuizRecords(conn, r) {
  const [members] = await conn.query('SELECT id FROM members')
  for (let i = 0; i < 15; i++) {
    await conn.query('INSERT INTO quiz_records (member_id,score,total) VALUES (?,?,5)',
      [members[i%members.length].id, Math.floor(Math.random()*5)+1])
    r.quizRecords++
  }
}

module.exports = { run, mockUsers, mockPosts, mockComments, mockLikes, mockConversations, mockNotifications, mockOrders, mockQuizRecords, COS_BASE }
