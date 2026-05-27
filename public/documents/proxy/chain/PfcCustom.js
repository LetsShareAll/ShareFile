// Clash Nyanpasu JavaScript Template
// Documentation on https://nyanpasu.elaina.moe/

/** @type {config} */
export default function (profile) {
  let proxiesNames = [];
  for (const proxy of profile.proxies) {
    proxiesNames = [...proxiesNames, ...[proxy.name]];
  }
  let proxiesNamesHK = [];
  for (const proxyName of proxiesNames) {
    if (/港|HK|Hong Kong/.test(proxyName)) {
      proxiesNamesHK = [...proxiesNamesHK, ...[proxyName]];
    }
  }
  let proxiesNamesTW = [];
  for (const proxyName of proxiesNames) {
    if (/台|新北|彰化|TW|Taiwan/.test(proxyName)) {
      proxiesNamesTW = [...proxiesNamesTW, ...[proxyName]];
    }
  }
  let proxiesNamesJP = [];
  for (const proxyName of proxiesNames) {
    if (
      /日本|川日|东京|大阪|泉日|埼玉|沪日|深日|[^-]日|JP|Japan/.test(proxyName)
    ) {
      proxiesNamesJP = [...proxiesNamesJP, ...[proxyName]];
    }
  }
  let proxiesNamesUS = [];
  for (const proxyName of proxiesNames) {
    if (
      /美|波特兰|达拉斯|俄勒冈|凤凰城|费利蒙|硅谷|拉斯维加斯|洛杉矶|圣何塞|圣克拉拉|西雅图|芝加哥|US|United States/.test(
        proxyName,
      )
    ) {
      proxiesNamesUS = [...proxiesNamesUS, ...[proxyName]];
    }
  }
  let proxiesNamesSG = [];
  for (const proxyName of proxiesNames) {
    if (/新加坡|坡|狮城|SG|Singapore/.test(proxyName)) {
      proxiesNamesSG = [...proxiesNamesSG, ...[proxyName]];
    }
  }
  let proxiesNamesKR = [];
  for (const proxyName of proxiesNames) {
    if (/KR|Korea|KOR|首尔|韩|韓/.test(proxyName)) {
      proxiesNamesKR = [...proxiesNamesKR, ...[proxyName]];
    }
  }
  let proxiesNamesNF = [];
  for (const proxyName of proxiesNames) {
    if (/NF|奈飞|解锁|Netflix|NETFLIX|Media|流媒体/.test(proxyName)) {
      proxiesNamesNF = [...proxiesNamesNF, ...[proxyName]];
    }
  }
  let proxiesNamesYT = [];
  for (const proxyName of proxiesNames) {
    if (/Media|流媒体/.test(proxyName)) {
      proxiesNamesYT = [...proxiesNamesYT, ...[proxyName]];
    }
  }
  let proxiesNamesNE = [];
  for (const proxyName of proxiesNames) {
    if (/网易|音乐|解锁|Music|NetEase/.test(proxyName)) {
      proxiesNamesNE = [...proxiesNamesNE, ...[proxyName]];
    }
  }
  let proxiesNamesOA = [];
  for (const proxyName of proxiesNames) {
    if (/GPT/.test(proxyName)) {
      proxiesNamesOA = [...proxiesNamesOA, ...[proxyName]];
    }
  }
  let proxyGroups = [
    {
      name: '🔰 节点选择',
      type: 'select',
      proxies: ['♻️ 自动选择', '🚧 故障转移', '🎯 全球直连'],
    },
    {
      name: '♻️ 自动选择',
      type: 'url-test',
      url: 'http://www.gstatic.com/generate_204',
      interval: 700,
      proxies: [],
    },
    {
      name: '🚧 故障转移',
      type: 'fallback',
      url: 'http://www.gstatic.com/generate_204',
      interval: 300,
      proxies: [],
    },
    {
      name: '🤖 智能聊天',
      type: 'select',
      proxies: ['🧠 智聊节点', '🔰 节点选择', '♻️ 自动选择', '🎯 全球直连'],
    },
    {
      name: '🎮 游戏平台',
      type: 'select',
      proxies: ['🎯 全球直连', '🔰 节点选择', '♻️ 自动选择'],
    },
    {
      name: '🚂 蒸汽社区',
      type: 'select',
      proxies: ['🔰 节点选择', '♻️ 自动选择', '🎯 全球直连'],
    },
    {
      name: '🎥 奈飞视频',
      type: 'select',
      proxies: ['📹 奈飞节点', '🔰 节点选择', '🎯 全球直连'],
    },
    {
      name: '🐉 巴哈姆特',
      type: 'select',
      proxies: ['🇨🇳 台湾节点', '🔰 节点选择', '🎯 全球直连'],
    },
    {
      name: '📺 哔哩哔哩',
      type: 'select',
      proxies: ['🎯 全球直连', '🇭🇰 香港节点', '🇨🇳 台湾节点', '🔰 节点选择'],
    },
    {
      name: '🎶 网易音乐',
      type: 'select',
      proxies: ['🎯 全球直连', '🎟️ 网易节点', '🔰 节点选择', '♻️ 自动选择'],
    },
    {
      name: '📽️ 油管视频',
      type: 'select',
      proxies: ['⛽ 油管节点', '🔰 节点选择', '🎯 全球直连'],
    },
    {
      name: '📢 谷歌推送',
      type: 'select',
      proxies: ['🎯 全球直连', '🔰 节点选择', '♻️ 自动选择'],
    },
    {
      name: 'Ⓜ️ 微软服务',
      type: 'select',
      proxies: ['🎯 全球直连', '🔰 节点选择', '♻️ 自动选择'],
    },
    {
      name: '💾 微软云盘',
      type: 'select',
      proxies: ['🎯 全球直连', '🔰 节点选择'],
    },
    {
      name: '🍎 苹果服务',
      type: 'select',
      proxies: ['🎯 全球直连', '🔰 节点选择', '♻️ 自动选择'],
    },
    {
      name: '☁️ 苹果云盘',
      type: 'select',
      proxies: ['🎯 全球直连', '🔰 节点选择'],
    },
    {
      name: '📲 电报信息',
      type: 'select',
      proxies: ['🔰 节点选择', '🎯 全球直连'],
    },
    {
      name: '🌍 国外媒体',
      type: 'select',
      proxies: ['🔰 节点选择', '♻️ 自动选择', '🎯 全球直连'],
    },
    {
      name: '🌏 国内媒体',
      type: 'select',
      proxies: ['🎯 全球直连', '🔰 节点选择'],
    },
    {
      name: '🇭🇰 香港节点',
      type: 'url-test',
      url: 'http://www.gstatic.com/generate_204',
      interval: 300,
      proxies: [],
    },
    {
      name: '🇨🇳 台湾节点',
      type: 'url-test',
      url: 'http://www.gstatic.com/generate_204',
      interval: 300,
      proxies: [],
    },
    {
      name: '🇯🇵 日本节点',
      type: 'url-test',
      url: 'http://www.gstatic.com/generate_204',
      interval: 300,
      proxies: [],
    },
    {
      name: '🇺🇸 美国节点',
      type: 'url-test',
      url: 'http://www.gstatic.com/generate_204',
      interval: 300,
      proxies: [],
    },
    {
      name: '🇸🇬 狮城节点',
      type: 'url-test',
      url: 'http://www.gstatic.com/generate_204',
      interval: 300,
      proxies: [],
    },
    {
      name: '🇰🇷 韩国节点',
      type: 'url-test',
      url: 'http://www.gstatic.com/generate_204',
      interval: 300,
      proxies: [],
    },
    {
      name: '📹 奈飞节点',
      type: 'url-test',
      url: 'http://www.gstatic.com/generate_204',
      interval: 300,
      proxies: [],
    },
    {
      name: '⛽ 油管节点',
      type: 'url-test',
      url: 'http://www.gstatic.com/generate_204',
      interval: 300,
      proxies: [],
    },
    {
      name: '🎟️ 网易节点',
      type: 'url-test',
      url: 'http://www.gstatic.com/generate_204',
      interval: 300,
      proxies: [],
    },
    {
      name: '🧠 智聊节点',
      type: 'url-test',
      url: 'http://www.gstatic.com/generate_204',
      interval: 300,
      proxies: [],
    },
    {
      name: '⛔️ 广告拦截',
      type: 'select',
      proxies: ['🛑 全球拦截', '🎯 全球直连', '🔰 节点选择'],
    },
    {
      name: '🍃 应用净化',
      type: 'select',
      proxies: ['🛑 全球拦截', '🎯 全球直连', '🔰 节点选择'],
    },
    {
      name: '🚫 运营劫持',
      type: 'select',
      proxies: ['🛑 全球拦截', '🎯 全球直连', '🔰 节点选择'],
    },
    {
      name: '🎯 全球直连',
      type: 'select',
      proxies: ['DIRECT'],
    },
    {
      name: '🛑 全球拦截',
      type: 'select',
      proxies: ['REJECT', 'DIRECT'],
    },
    {
      name: '🐟 漏网之鱼',
      type: 'select',
      proxies: ['🔰 节点选择', '♻️ 自动选择', '🎯 全球直连'],
    },
  ];
  for (const proxyGroup of proxyGroups) {
    if (
      /节点选择|自动选择|故障转移|奈飞视频|油管视频|巴哈姆特|哔哩哔哩|网易音乐|国外|谷歌|微软|苹果|电报|智能聊天|游戏平台|蒸汽社区|漏网之鱼/.test(
        proxyGroup.name,
      )
    ) {
      proxyGroup.proxies = [...proxyGroup.proxies, ...proxiesNames];
    }
    if (/香港/.test(proxyGroup.name)) {
      proxyGroup.proxies = [...proxyGroup.proxies, ...proxiesNamesHK];
    }
    if (/台湾/.test(proxyGroup.name)) {
      proxyGroup.proxies = [...proxyGroup.proxies, ...proxiesNamesTW];
    }
    if (/日本/.test(proxyGroup.name)) {
      proxyGroup.proxies = [...proxyGroup.proxies, ...proxiesNamesJP];
    }
    if (/美国/.test(proxyGroup.name)) {
      proxyGroup.proxies = [...proxyGroup.proxies, ...proxiesNamesUS];
    }
    if (/狮城/.test(proxyGroup.name)) {
      proxyGroup.proxies = [...proxyGroup.proxies, ...proxiesNamesSG];
    }
    if (/韩国/.test(proxyGroup.name)) {
      proxyGroup.proxies = [...proxyGroup.proxies, ...proxiesNamesKR];
    }
    if (/奈飞节点/.test(proxyGroup.name)) {
      proxyGroup.proxies = [...proxyGroup.proxies, ...proxiesNamesNF];
    }
    if (/油管节点/.test(proxyGroup.name)) {
      proxyGroup.proxies = [...proxyGroup.proxies, ...proxiesNamesYT];
    }
    if (/网易节点/.test(proxyGroup.name)) {
      proxyGroup.proxies = [...proxyGroup.proxies, ...proxiesNamesNE];
    }
    if (/智聊/.test(proxyGroup.name)) {
      proxyGroup.proxies = [...proxyGroup.proxies, ...proxiesNamesOA];
    }
  }
  for (const proxyGroup of proxyGroups) {
    if (proxyGroup.proxies.length == 0) {
      proxyGroup.proxies = ['🎯 全球直连'];
    }
  }
  const customRules = [
    // AGE 动漫
    'DOMAIN-SUFFIX,age.tv,🎯 全球直连',
    'DOMAIN-SUFFIX,agedm.com,🎯 全球直连',
    'DOMAIN-SUFFIX,agefans.org,🎯 全球直连',
    // Anthropic
    'DOMAIN,servd-anthropic-website.b-cdn.net,🤖 智能聊天',
    // Clash 管理
    'DOMAIN,clash.razord.top,🎯 全球直连',
    'DOMAIN,yacd.haishan.me,🎯 全球直连',
    // Clash Nyanpasu
    'DOMAIN,nyanpasu.elaina.moe,🎯 全球直连',
    // Github 镜像
    'DOMAIN-SUFFIX,ghfast.top,🎯 全球直连',
    'DOMAIN-SUFFIX,ghproxy.cc,🎯 全球直连',
    'DOMAIN-SUFFIX,ghproxy.com,🎯 全球直连',
    'DOMAIN-SUFFIX,ghproxy.link,🎯 全球直连',
    'DOMAIN-SUFFIX,ghproxy.net,🎯 全球直连',
    // 谷歌 Bard
    'DOMAIN,bard.google.com,🤖 智能聊天',
    // JetBrains
    'DOMAIN-SUFFIX,jetbrains.com,🎯 全球直连',
    // JSDelivr
    'DOMAIN,fastly.jsdelivr.net,🎯 全球直连',
    // 喵呜次元
    'DOMAIN,anime.mwvod.xyz,🎯 全球直连',
    'DOMAIN-SUFFIX,akamaized.net,🎯 全球直连',
    'DOMAIN-SUFFIX,catw.moe,🎯 全球直连',
    'DOMAIN-SUFFIX,mwcy.net,🎯 全球直连',
    // NodeJS
    'DOMAIN-SUFFIX,npmjs.org,🔰 节点选择',
    // Pixiv 镜像
    'DOMAIN-SUFFIX,pixivel.art,🎯 全球直连',
    // Poe
    'DOMAIN-SUFFIX,poe.com,🤖 智能聊天',
    // Steam
    'DOMAIN-SUFFIX,steamcommunity.com,🚂 蒸汽社区',
    // Ubuntu
    'DOMAIN-SUFFIX,ubuntu.com,🎯 全球直连',
    // VCB Studio
    'DOMAIN-SUFFIX,404.website,🎯 全球直连',
    'DOMAIN-SUFFIX,acgrip.com,🎯 全球直连',
    'DOMAIN-SUFFIX,vcb-s.com,🎯 全球直连',
    // 一起分享吧
    'DOMAIN-SUFFIX,lssa.fun,🎯 全球直连',
    // 云崽
    'DOMAIN-SUFFIX,yunzai.chat,🎯 全球直连',
    // 知了
    'DOMAIN-SUFFIX,zhile.io,🎯 全球直连',
    // 其它
    'DOMAIN-SUFFIX,activated.win,🎯 全球直连',
  ];
  const providersRules = [
    'RULE-SET,bing,🤖 智能聊天',
    'RULE-SET,openAi,🤖 智能聊天',
    'RULE-SET,claude,🤖 智能聊天',
    'RULE-SET,epic,🎮 游戏平台',
    'RULE-SET,sony,🎮 游戏平台',
    'RULE-SET,steam,🎮 游戏平台',
    'RULE-SET,nintendo,🎮 游戏平台',
    'RULE-SET,netflix,🎥 奈飞视频',
    'RULE-SET,bahamut,🐉 巴哈姆特',
    'RULE-SET,bilibiliHMT,📺 哔哩哔哩',
    'RULE-SET,bilibili,📺 哔哩哔哩',
    'RULE-SET,neteaseMusic,🎶 网易音乐',
    'RULE-SET,youtube,📽️ 油管视频',
    'RULE-SET,googleFCM,📢 谷歌推送',
    'RULE-SET,microsoft,Ⓜ️ 微软服务',
    'RULE-SET,onedrive,💾 微软云盘',
    'RULE-SET,apple,🍎 苹果服务',
    'RULE-SET,icloud,☁️ 苹果云盘',
    'RULE-SET,telegramcidr,📲 电报信息',
    'RULE-SET,proxyMedia,🌍 国外媒体',
    'RULE-SET,chinaMedia,🌏 国内媒体',
    'RULE-SET,banAD,⛔️ 广告拦截',
    'RULE-SET,banEasyList,⛔️ 广告拦截',
    'RULE-SET,banProgramAD,🍃 应用净化',
    'RULE-SET,reject,🛑 全球拦截',
    'RULE-SET,gfw,🔰 节点选择',
    'RULE-SET,google,🔰 节点选择',
    'RULE-SET,proxy,🔰 节点选择',
    'RULE-SET,tld-not-cn,🔰 节点选择',
    'RULE-SET,applications,🎯 全球直连',
    'RULE-SET,cncidr,🎯 全球直连',
    'RULE-SET,direct,🎯 全球直连',
    'RULE-SET,lancidr,🎯 全球直连',
    'RULE-SET,private,🎯 全球直连',
  ];
  const basicRules = [
    'DOMAIN-KEYWORD,aria2,🎯 全球直连',
    'DOMAIN-KEYWORD,xunlei,🎯 全球直连',
    'DOMAIN-KEYWORD,yunpan,🎯 全球直连',
    'DOMAIN-KEYWORD,Thunder,🎯 全球直连',
    'DOMAIN-KEYWORD,XLLiveUD,🎯 全球直连',
    'DOMAIN-SUFFIX,local,🎯 全球直连',
    'GEOIP,CN,🎯 全球直连,no-resolve',
    'GEOIP,LAN,🎯 全球直连',
    'PROCESS-NAME,aria2c,🎯 全球直连',
    'PROCESS-NAME,fdm,🎯 全球直连',
    'PROCESS-NAME,Folx,🎯 全球直连',
    'PROCESS-NAME,NetTransport,🎯 全球直连',
    'PROCESS-NAME,Thunder,🎯 全球直连',
    'PROCESS-NAME,Transmission,🎯 全球直连',
    'PROCESS-NAME,uTorrent,🎯 全球直连',
    'PROCESS-NAME,WebTorrent,🎯 全球直连',
    'PROCESS-NAME,WebTorrent Helper,🎯 全球直连',
    'PROCESS-NAME,DownloadService,🎯 全球直连',
    'PROCESS-NAME,Weiyun,🎯 全球直连',
    'GEOIP,CN,🎯 全球直连',
    'MATCH,🐟 漏网之鱼',
  ];
  const rules = [...customRules, ...providersRules, ...basicRules];
  const ruleProviders = {
    // ACL4SSR：https://github.com/ACL4SSR/ACL4SSR/tree/master
    bahamut: {
      type: 'http',
      behavior: 'classical',
      url: 'https://ghfast.top/raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/Bahamut.yaml',
      path: './ruleset/bahamut.yaml',
      interval: 86400,
    },
    banAD: {
      type: 'http',
      behavior: 'classical',
      url: 'https://ghfast.top/raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/BanAD.yaml',
      path: './ruleset/banAD.yaml',
      interval: 86400,
    },
    banProgramAD: {
      type: 'http',
      behavior: 'classical',
      url: 'https://ghfast.top/raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/BanProgramAD.yaml',
      path: './ruleset/banProgramAD.yaml',
      interval: 86400,
    },
    banEasyList: {
      type: 'http',
      behavior: 'classical',
      url: 'https://ghfast.top/raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/BanEasyList.yaml',
      path: './ruleset/banEasyList.yaml',
      interval: 86400,
    },
    bilibili: {
      type: 'http',
      behavior: 'classical',
      url: 'https://ghfast.top/raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/Bilibili.yaml',
      path: './ruleset/bilibili.yaml',
      interval: 86400,
    },
    bilibiliHMT: {
      type: 'http',
      behavior: 'classical',
      url: 'https://ghfast.top/raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/BilibiliHMT.yaml',
      path: './ruleset/bilibiliHMT.yaml',
      interval: 86400,
    },
    bing: {
      type: 'http',
      behavior: 'classical',
      url: 'https://ghfast.top/raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/Bing.yaml',
      path: './ruleset/bing.yaml',
      interval: 86400,
    },
    chinaMedia: {
      type: 'http',
      behavior: 'classical',
      url: 'https://ghfast.top/raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/ChinaMedia.yaml',
      path: './ruleset/chinaMedia.yaml',
      interval: 86400,
    },
    claude: {
      type: 'http',
      behavior: 'classical',
      url: 'https://ghfast.top/raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/Claude.yaml',
      path: './ruleset/claude.yaml',
      interval: 86400,
    },
    epic: {
      type: 'http',
      behavior: 'classical',
      url: 'https://ghfast.top/raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/Epic.yaml',
      path: './ruleset/epic.yaml',
      interval: 86400,
    },
    googleFCM: {
      type: 'http',
      behavior: 'classical',
      url: 'https://ghfast.top/raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/GoogleFCM.yaml',
      path: './ruleset/googleFCM.yaml',
      interval: 86400,
    },
    microsoft: {
      type: 'http',
      behavior: 'classical',
      url: 'https://ghfast.top/raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/Microsoft.yaml',
      path: './ruleset/microsoft.yaml',
      interval: 86400,
    },
    neteaseMusic: {
      type: 'http',
      behavior: 'classical',
      url: 'https://ghfast.top/raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/NetEaseMusic.yaml',
      path: './ruleset/neteaseMusic.yaml',
      interval: 86400,
    },
    netflix: {
      type: 'http',
      behavior: 'classical',
      url: 'https://ghfast.top/raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/Netflix.yaml',
      path: './ruleset/netflix.yaml',
      interval: 86400,
    },
    nintendo: {
      type: 'http',
      behavior: 'classical',
      url: 'https://ghfast.top/raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/Nintendo.yaml',
      path: './ruleset/nintendo.yaml',
      interval: 86400,
    },
    openAi: {
      type: 'http',
      behavior: 'classical',
      url: 'https://ghfast.top/raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/OpenAi.yaml',
      path: './ruleset/openAi.yaml',
      interval: 86400,
    },
    onedrive: {
      type: 'http',
      behavior: 'classical',
      url: 'https://ghfast.top/raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/OneDrive.yaml',
      path: './ruleset/onedrive.yaml',
      interval: 86400,
    },
    proxyMedia: {
      type: 'http',
      behavior: 'classical',
      url: 'https://ghfast.top/raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/ProxyMedia.yaml',
      path: './ruleset/proxyMedia.yaml',
      interval: 86400,
    },
    sony: {
      type: 'http',
      behavior: 'classical',
      url: 'https://ghfast.top/raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/Sony.yaml',
      path: './ruleset/sony.yaml',
      interval: 86400,
    },
    steam: {
      type: 'http',
      behavior: 'classical',
      url: 'https://ghfast.top/raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/Steam.yaml',
      path: './ruleset/steam.yaml',
      interval: 86400,
    },
    youtube: {
      type: 'http',
      behavior: 'classical',
      url: 'https://ghfast.top/raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/YouTube.yaml',
      path: './ruleset/youtube.yaml',
      interval: 86400,
    },
    // Loyalsoldier：https://github.com/Loyalsoldier/clash-rules
    apple: {
      type: 'http',
      behavior: 'domain',
      url: 'https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/apple.txt',
      path: './ruleset/apple.yaml',
      interval: 86400,
    },
    applications: {
      type: 'http',
      behavior: 'classical',
      url: 'https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/applications.txt',
      path: './ruleset/applications.yaml',
      interval: 86400,
    },
    cncidr: {
      type: 'http',
      behavior: 'ipcidr',
      url: 'https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/cncidr.txt',
      path: './ruleset/cncidr.yaml',
      interval: 86400,
    },
    direct: {
      type: 'http',
      behavior: 'domain',
      url: 'https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/direct.txt',
      path: './ruleset/direct.yaml',
      interval: 86400,
    },
    icloud: {
      type: 'http',
      behavior: 'domain',
      url: 'https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/icloud.txt',
      path: './ruleset/icloud.yaml',
      interval: 86400,
    },
    lancidr: {
      type: 'http',
      behavior: 'ipcidr',
      url: 'https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/lancidr.txt',
      path: './ruleset/lancidr.yaml',
      interval: 86400,
    },
    gfw: {
      type: 'http',
      behavior: 'domain',
      url: 'https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/gfw.txt',
      path: './ruleset/gfw.yaml',
      interval: 86400,
    },
    google: {
      type: 'http',
      behavior: 'domain',
      url: 'https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/google.txt',
      path: './ruleset/google.yaml',
      interval: 86400,
    },
    private: {
      type: 'http',
      behavior: 'domain',
      url: 'https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/private.txt',
      path: './ruleset/private.yaml',
      interval: 86400,
    },
    proxy: {
      type: 'http',
      behavior: 'domain',
      url: 'https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/proxy.txt',
      path: './ruleset/proxy.yaml',
      interval: 86400,
    },
    reject: {
      type: 'http',
      behavior: 'domain',
      url: 'https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/reject.txt',
      path: './ruleset/reject.yaml',
      interval: 86400,
    },
    telegramcidr: {
      type: 'http',
      behavior: 'ipcidr',
      url: 'https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/telegramcidr.txt',
      path: './ruleset/telegramcidr.yaml',
      interval: 86400,
    },
    'tld-not-cn': {
      type: 'http',
      behavior: 'domain',
      url: 'https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/tld-not-cn.txt',
      path: './ruleset/tld-not-cn.yaml',
      interval: 86400,
    },
  };
  profile['proxy-groups'] = proxyGroups;
  profile.rules = rules;
  profile['rule-providers'] = ruleProviders;

  /**
   * 为代理组添加图标
   * @param {string} name - 匹配代理组名称
   * @param {string} [iconset] - 图标名称或链接
   */
  const addIcon = (name, iconset) => {
    const re = new RegExp(name);
    console.log(re);
    for (let proxyGroup of proxyGroups) {
      if (re.test(proxyGroup.name)) {
        console.log('添加图标：' + proxyGroup.name);
        if (!iconset) {
          iconset = name;
        }
        proxyGroup['icon'] = iconset.startsWith('http')
          ? iconset
          : `https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/${iconset}.png`;
        console.log(proxyGroup.icon);
      }
    }
  };

  // 此处定义你自己的代理组图标
  addIcon(
    'HK|香港',
    'https://fastly.jsdelivr.net/gh/HatScripts/circle-flags@gh-pages/flags/hk.svg',
  );
  addIcon(
    'TW|台湾',
    'https://fastly.jsdelivr.net/gh/HatScripts/circle-flags@gh-pages/flags/tw.svg',
  );
  addIcon(
    'JP|日本',
    'https://fastly.jsdelivr.net/gh/HatScripts/circle-flags@gh-pages/flags/jp.svg',
  );
  addIcon(
    'US|美国',
    'https://fastly.jsdelivr.net/gh/HatScripts/circle-flags@gh-pages/flags/us.svg',
  );
  addIcon(
    'SG|狮城|新加坡',
    'https://fastly.jsdelivr.net/gh/HatScripts/circle-flags@gh-pages/flags/sg.svg',
  );
  addIcon(
    'KR|韩国',
    'https://fastly.jsdelivr.net/gh/HatScripts/circle-flags@gh-pages/flags/kr.svg',
  );
  addIcon('节点选择', 'Proxy');
  addIcon('自动选择', 'Auto');
  addIcon('故障转移', 'Back');
  addIcon('OpenAI|智能|智聊', 'ChatGPT');
  addIcon('Game|游戏', 'Game');
  addIcon('Steam|蒸汽', 'Steam');
  addIcon('Netflix|奈飞', 'Netflix');
  addIcon('Bahamut|巴哈姆特', 'Bahamut');
  addIcon('Bilibili|哔哩哔哩', 'bilibili');
  addIcon('Netease|网易', 'Netease_Music');
  addIcon('YouTube|油管', 'YouTube');
  addIcon('Google|谷歌', 'Google');
  addIcon('Microsoft|微软', 'Microsoft');
  addIcon('OneDrive|微软云盘', 'OneDrive');
  addIcon('Apple|苹果', 'Apple');
  addIcon('iCloud|苹果云盘', 'iCloud');
  addIcon('Telegram|电报', 'Telegram');
  addIcon('Global|国外', 'ForeignMedia');
  addIcon('Local|国内', 'China');
  addIcon('奈飞节点', 'Netflix_Letter');
  addIcon('油管节点', 'YouTube_Letter');
  addIcon('网易节点', 'Netease_Music_Unlock');
  addIcon('智聊节点', 'AI');
  addIcon('广告', 'Advertising');
  addIcon('净化', 'TestFlight');
  addIcon('劫持', 'Hijacking');
  addIcon('直连', 'Direct');
  addIcon('拦截', 'Reject');
  addIcon('漏网', 'Area');
  addIcon('Disney|迪士尼', 'Disney+');
  addIcon('PayPal');
  addIcon('Spotify');
  addIcon('Proxies|代理', 'Global');
  addIcon('Final');

  return profile;
}
