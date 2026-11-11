import { CdpClient } from '../src/codex/cdp-client.mjs';
import { listCodexTargets } from '../src/codex/target.mjs';

const port = Number(process.argv[2] || 9335);
const targets = await listCodexTargets({ port });
if (targets.length !== 1) throw new Error(`Expected one Codex main target, found ${targets.length}`);
const cdp = new CdpClient(targets[0].webSocketDebuggerUrl);
await cdp.connect();
try {
  const expression = `(() => {
    const describe = (el) => {
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      const b = getComputedStyle(el, '::before'), a = getComputedStyle(el, '::after');
      return { tag: el.tagName.toLowerCase(), className: typeof el.className === 'string' ? el.className.slice(0, 240) : '',
        role: el.getAttribute('role'), attrs: [...el.attributes].filter(x => /^(data-|aria-)/.test(x.name)).slice(0, 8).map(x => x.name + '=' + x.value.slice(0, 60)),
        rect: [r.x,r.y,r.width,r.height].map(Math.round), color:s.color, background:s.backgroundColor,
        image:s.backgroundImage, borderTop:s.borderTop, shadow:s.boxShadow, before:[b.content,b.backgroundImage,b.backgroundColor], after:[a.content,a.backgroundImage,a.backgroundColor],
        root:el.getRootNode() === document ? 'document' : 'other', parentClass: typeof el.parentElement?.className === 'string' ? el.parentElement.className.slice(0,160) : '' };
    };
    const all = [...document.querySelectorAll('#root *, body > *')];
    const visible = all.filter(el => { const r=el.getBoundingClientRect(); return r.width>5 && r.height>3 && r.right>0 && r.bottom>0 && r.x<innerWidth && r.y<innerHeight; });
    const candidates = visible.filter(el => {
      const r=el.getBoundingClientRect(),s=getComputedStyle(el),b=getComputedStyle(el,'::before'),a=getComputedStyle(el,'::after');
      if(r.width<100 || r.height<5) return false;
      const bright = value => { const m=/rgba?\\((\\d+), (\\d+), (\\d+)/.exec(value); return m && Math.min(...m.slice(1).map(Number))>225; };
      return s.backgroundImage!=='none' || bright(s.backgroundColor) || bright(b.backgroundColor) || bright(a.backgroundColor) ||
        ((r.y>innerHeight*.7 || r.x>innerWidth*.7) && /(?:fade|gradient|summary-panel|composer)/i.test(String(el.className)));
    }).sort((a,b)=>{const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return y.y-x.y;}).slice(0,130).map(describe);
    const fades = [...document.querySelectorAll('#root [class*="fade"], #root [class*="Fade"], #root [class*="gradient"], #root [class*="from-surface"], #root [class*="summary-panel"], #root [class*="mode-toggle"]')]
      .filter(el=>{const r=el.getBoundingClientRect();return r.width>20&&r.height>0&&r.bottom>0&&r.top<innerHeight;}).slice(0,100).map(describe);
    const samples = [[.25,.86],[.5,.86],[.75,.86],[.92,.08],[.92,.14],[.88,.19]].map(([x,y])=>{const el=document.elementFromPoint(innerWidth*x,innerHeight*y);return {at:[x,y],chain:el?[el,...[...Array(5)].map((_,i)=>{let n=el;for(let j=0;j<=i;j++)n=n?.parentElement;return n;}).filter(Boolean)].map(describe):[]};});
    const switchNodes = visible.filter(el=>/^(聊天|工作|Chat|Work)$/.test(el.textContent?.trim()||'') && el.children.length<2).slice(0,12).map(describe);
    const attachmentNodes = all.filter(el=>el.children.length<5 && /\\.(?:pdf|png|jpg|docx?)\\b/i.test(el.textContent?.trim()||'') && (el.textContent?.length||0)<180)
      .slice(0,20).map(el=>[el,el.parentElement,el.parentElement?.parentElement].filter(Boolean).map(describe));
    const resourceNodes = [...document.querySelectorAll('#root [class*="resource-card"], #root [class*="ResourceCard"]')].slice(0,30)
      .map(el=>[el,el.parentElement,el.firstElementChild].filter(Boolean).map(describe));
    const headerNodes = [...document.querySelectorAll('#root [class^="shell-"], #root [class^="headerRow-"]')]
      .filter(el=>{const r=el.getBoundingClientRect();return r.width>500&&r.y<160&&r.height>10;}).slice(0,15)
      .map(el=>[el,...el.children].filter(Boolean).slice(0,8).map(describe));
    return {viewport:[innerWidth,innerHeight],title:document.title, controller:window.__gptDaddyWallpaperControllerV1?.version,
      host:!!document.getElementById('gptdaddy-wallpaper-host'),style:!!document.getElementById('gptdaddy-wallpaper-style'), candidates,fades,samples,switchNodes,attachmentNodes,resourceNodes,headerNodes};
  })()`;
  const result = await cdp.call('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  console.log(JSON.stringify(result.result?.value, null, 2));
} finally { cdp.close(); }
