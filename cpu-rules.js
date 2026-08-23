// CPU class / chip-cap / decision-period rules. Injected inside the game closure by index.html.
const CPU_RULES_KEY='robot-ai-battle-v1-cpu-class';
const CPU_CLASSES={
  compact:{name:'Compact',limit:12,period:.08},
  standard:{name:'Standard',limit:18,period:.12},
  advanced:{name:'Advanced',limit:24,period:.16}
};
let cpuClass='standard';
try{const savedCpu=localStorage.getItem(CPU_RULES_KEY);if(savedCpu&&CPU_CLASSES[savedCpu])cpuClass=savedCpu;}catch(_e){}
function cpuChipLimit(){return CPU_CLASSES[cpuClass]?.limit||18;}
function cpuDecisionPeriod(){return CPU_CLASSES[cpuClass]?.period||.12;}
function cpuDecisionMs(){return Math.round(cpuDecisionPeriod()*1000);}
function cpuChipCount(p){let n=0;for(let i=1;i<36;i++)if(p[i])n++;return n;}
function cpuReachable(p){
  const seen=new Set([0]),q=[0];
  while(q.length){
    const i=q.shift(),c=i===0?{kind:'action',next:'R'}:p[i];if(!c)continue;
    const ns=c.kind==='action'?[nextCell(i,c.next)]:[nextCell(i,c.yes),nextCell(i,c.no)];
    for(const j of ns){
      if(j===0){seen.add(0);continue;}
      if(j!==i&&j>0&&j<36&&p[j]&&!seen.has(j)){seen.add(j);q.push(j);}
    }
  }
  return seen;
}
function cpuAdjacentDirs(p,i,allowed){
  const out=[];
  for(const [d] of dirs){const j=nextCell(i,d);if(j===0||(j!==i&&allowed.has(j)&&p[j]))out.push(d);}
  return out;
}
function cpuProgramHealth(p){
  const reach=cpuReachable(p),filledReach=[...reach].filter(i=>i>0&&p[i]);
  let broken=0;
  for(const i of filledReach){
    const c=p[i],fields=c.kind==='action'?['next']:['yes','no'];
    for(const f of fields){const j=nextCell(i,c[f]);if(j===i||(j!==0&&!p[j]))broken++;}
  }
  return{
    reachable:filledReach.length,
    weaponReachable:filledReach.some(i=>p[i].type==='weapon1'||p[i].type==='weapon2'),
    movementReachable:filledReach.some(i=>['forward','back','strafeL','strafeR','turnL','turnR','evade','aim'].includes(p[i].type)),
    broken
  };
}
function trimProgramToCpu(p,limit=cpuChipLimit()){
  const src=cloneProgram(p);
  if(!src[1])src[1]={type:'enemyInWideFov',kind:'cond',yes:'D',no:'L'};

  // Directed BFS from START. Parent links let us keep the shortest path to useful actions.
  const order=[],parent=new Map(),seen=new Set([0]),q=[0];
  while(q.length){
    const i=q.shift(),c=i===0?{kind:'action',next:'R'}:src[i];if(!c)continue;
    const ns=c.kind==='action'?[nextCell(i,c.next)]:[nextCell(i,c.yes),nextCell(i,c.no)];
    for(const j of ns){
      if(j<=0||j===i||j>=36||!src[j]||seen.has(j))continue;
      seen.add(j);parent.set(j,i);order.push(j);q.push(j);
    }
  }
  if(!seen.has(1)){seen.add(1);order.unshift(1);parent.set(1,0);}

  const keep=new Set([1]);
  function addPath(target){
    const path=[];let x=target,guard=0;
    while(x>0&&!keep.has(x)&&guard++<36){path.push(x);x=parent.get(x)??0;}
    path.reverse();
    for(const j of path){if(keep.size>=limit)break;keep.add(j);}
  }
  const weapons=order.filter(i=>src[i]&&(src[i].type==='weapon1'||src[i].type==='weapon2'));
  if(weapons.length)addPath(weapons[0]);
  const movers=order.filter(i=>src[i]&&['forward','back','strafeL','strafeR','turnL','turnR','evade','aim'].includes(src[i].type));
  if(movers.length)addPath(movers[0]);
  for(const i of order){if(keep.size>=limit)break;addPath(i);}

  const n=Array(36).fill(null);
  for(const i of keep)if(src[i])n[i]={...src[i]};
  if(!n[1])n[1]={type:'enemyInWideFov',kind:'cond',yes:'D',no:'L'};

  // If the source had no reachable weapon, turn a retained leaf into a weapon action.
  if(![...keep].some(i=>n[i]&&(n[i].type==='weapon1'||n[i].type==='weapon2'))){
    const candidates=[...keep].filter(i=>i>0).sort((a,b)=>b-a),pos=candidates[0]||1;
    n[pos]={type:'weapon1',kind:'action',next:pos===1?'L':'U'};
  }

  // Any branch whose destination was removed is redirected to another retained adjacent cell
  // (or START from cell 1). This prevents empty-cell resets from destroying the control graph.
  for(const i of [...keep]){
    const c=n[i];if(!c)continue;
    const fields=c.kind==='action'?['next']:['yes','no'];
    const opts=cpuAdjacentDirs(n,i,keep);
    for(const f of fields){
      const j=nextCell(i,c[f]);
      if(j===i||(j!==0&&!n[j])){
        c[f]=opts[0]||(i===1?'L':c[f]);
      }
    }
  }
  return n;
}
function applyCpuLimitAll(){programs.A=trimProgramToCpu(programs.A);programs.B=trimProgramToCpu(programs.B);}
const cpuSection=document.createElement('div');cpuSection.className='section';cpuSection.innerHTML='<strong>CPUクラス</strong><div class="controls" style="margin-top:8px"><label class="mini">クラス <select id="cpuClassSel"><option value="compact">Compact / 12チップ / 80ms</option><option value="standard">Standard / 18チップ / 120ms</option><option value="advanced">Advanced / 24チップ / 160ms</option></select></label><span id="cpuUsage" class="mini"></span></div><div class="mini" style="margin-top:6px">Compactは短いプログラムしか載りませんが反応が速く、Advancedは複雑な戦術を載せられる代わりに判断が遅くなります。STARTはチップ数に含みません。</div>';
const exploreSection=optimizeBtn.closest('.section');if(exploreSection)exploreSection.parentNode.insertBefore(cpuSection,exploreSection);
const cpuClassSel=root.querySelector('#cpuClassSel'),cpuUsage=root.querySelector('#cpuUsage');if(cpuClassSel)cpuClassSel.value=cpuClass;
function updateCpuUsage(){if(!cpuUsage)return;const a=cpuChipCount(programs.A),b=cpuChipCount(programs.B),lim=cpuChipLimit();cpuUsage.textContent=`自機 ${a}/${lim} ・ 敵 ${b}/${lim} ・ 判断 ${cpuDecisionMs()}ms`;}
const baseRenderProgram=renderProgram;renderProgram=function(){baseRenderProgram();updateCpuUsage();};
if(cpuClassSel)cpuClassSel.addEventListener('change',()=>{cpuClass=cpuClassSel.value;if(!CPU_CLASSES[cpuClass])cpuClass='standard';try{localStorage.setItem(CPU_RULES_KEY,cpuClass);}catch(_e){}applyCpuLimitAll();state.A.acc=0;state.B.acc=0;renderProgram();statusEl.textContent=`CPUを${CPU_CLASSES[cpuClass].name}（最大${cpuChipLimit()}チップ・判断${cpuDecisionMs()}ms）に変更しました。`;});
settingsGridEl.addEventListener('click',e=>{const cell=e.target.closest?.('.cell');if(!cell)return;const idx=[...settingsGridEl.children].indexOf(cell);if(idx<=0||programs[editSide][idx])return;if(cpuChipCount(programs[editSide])>=cpuChipLimit()){e.preventDefault();e.stopImmediatePropagation();statusEl.textContent=`CPU上限です：${CPU_CLASSES[cpuClass].name}は最大${cpuChipLimit()}チップです。`;updateCpuUsage();}},true);
sampleBtn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();programs[editSide]=trimProgramToCpu(randomProgram());selectedCell=1;state[editSide].pc=0;renderProgram();statusEl.textContent=`${editSide==='A'?'自機':'敵機'}をCPU上限${cpuChipLimit()}チップ以内でランダム配置しました。`;},true);
const baseSimCpu=simulateBattleWeaponAware;simulateBattleWeaponAware=function(pa,pb,seed,a1,a2,b1,b2){return baseSimCpu(trimProgramToCpu(pa),trimProgramToCpu(pb),seed,a1,a2,b1,b2);};
setTimeout(()=>{
  const baseOptimizeCpu=optimizeHybrid;
  optimizeHybrid=async function(maxGenerations=1000){
    applyCpuLimitAll();
    const r=await baseOptimizeCpu(maxGenerations);
    applyCpuLimitAll();
    let ha=cpuProgramHealth(programs.A),hb=cpuProgramHealth(programs.B);
    // Invalid final graphs are never installed. Fall back only if the explored graph is structurally unusable.
    if(!ha.weaponReachable||ha.broken){programs.A=trimProgramToCpu(handDesignedChampion('A'));ha=cpuProgramHealth(programs.A);}
    if(!hb.weaponReachable||hb.broken){programs.B=trimProgramToCpu(handDesignedChampion('B'));hb=cpuProgramHealth(programs.B);}
    renderProgram();
    if(typeof saveOptimizedResult==='function')saveOptimizedResult({cpuClass,cpuLimit:cpuChipLimit(),cpuDecisionMs:cpuDecisionMs(),cpuHealth:{A:ha,B:hb}});
    evoDetail.textContent+=` / CPU ${CPU_CLASSES[cpuClass].name} ${cpuChipLimit()}チップ ${cpuDecisionMs()}ms / 経路A ${ha.reachable}・武器${ha.weaponReachable?'到達':'不可'}・断線${ha.broken}`;
    return r;
  };
  updateCpuUsage();
},0);
