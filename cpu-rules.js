// CPU class / chip-cap rules. Injected inside the game closure by index.html.
const CPU_RULES_KEY='robot-ai-battle-v1-cpu-class';
const CPU_CLASSES={compact:{name:'Compact',limit:12},standard:{name:'Standard',limit:18},advanced:{name:'Advanced',limit:24}};
let cpuClass='standard';
try{const savedCpu=localStorage.getItem(CPU_RULES_KEY);if(savedCpu&&CPU_CLASSES[savedCpu])cpuClass=savedCpu;}catch(_e){}
function cpuChipLimit(){return CPU_CLASSES[cpuClass]?.limit||18;}
function cpuChipCount(p){let n=0;for(let i=1;i<36;i++)if(p[i])n++;return n;}
function cpuReachable(p){const seen=new Set([0]),q=[0];while(q.length){const i=q.shift(),c=i===0?{kind:'action',next:'R'}:p[i];if(!c)continue;const ns=c.kind==='action'?[nextCell(i,c.next)]:[nextCell(i,c.yes),nextCell(i,c.no)];for(const j of ns)if(j!==i&&j>=0&&j<36&&!seen.has(j)){seen.add(j);q.push(j);}}return seen;}
function trimProgramToCpu(p,limit=cpuChipLimit()){
  const n=cloneProgram(p),reach=cpuReachable(n);
  while(cpuChipCount(n)>limit){
    const filled=[];for(let i=1;i<36;i++)if(n[i])filled.push(i);
    let candidates=filled.filter(i=>i!==1&&!reach.has(i));
    if(!candidates.length)candidates=filled.filter(i=>i!==1&&!['weapon1','weapon2'].includes(n[i]?.type));
    if(!candidates.length)candidates=filled.filter(i=>i!==1);
    if(!candidates.length)break;
    candidates.sort((a,b)=>b-a);n[candidates[0]]=null;
  }
  return n;
}
function applyCpuLimitAll(){programs.A=trimProgramToCpu(programs.A);programs.B=trimProgramToCpu(programs.B);}
const cpuSection=document.createElement('div');cpuSection.className='section';cpuSection.innerHTML='<strong>CPUクラス</strong><div class="controls" style="margin-top:8px"><label class="mini">クラス <select id="cpuClassSel"><option value="compact">Compact / 12チップ</option><option value="standard">Standard / 18チップ</option><option value="advanced">Advanced / 24チップ</option></select></label><span id="cpuUsage" class="mini"></span></div><div class="mini" style="margin-top:6px">高性能CPUほど複雑なプログラムを搭載できます。STARTはチップ数に含みません。</div>';
const exploreSection=optimizeBtn.closest('.section');if(exploreSection)exploreSection.parentNode.insertBefore(cpuSection,exploreSection);
const cpuClassSel=root.querySelector('#cpuClassSel'),cpuUsage=root.querySelector('#cpuUsage');if(cpuClassSel)cpuClassSel.value=cpuClass;
function updateCpuUsage(){if(!cpuUsage)return;const a=cpuChipCount(programs.A),b=cpuChipCount(programs.B),lim=cpuChipLimit();cpuUsage.textContent=`自機 ${a}/${lim} ・ 敵 ${b}/${lim}`;}
const baseRenderProgram=renderProgram;renderProgram=function(){baseRenderProgram();updateCpuUsage();};
if(cpuClassSel)cpuClassSel.addEventListener('change',()=>{cpuClass=cpuClassSel.value;if(!CPU_CLASSES[cpuClass])cpuClass='standard';try{localStorage.setItem(CPU_RULES_KEY,cpuClass);}catch(_e){}applyCpuLimitAll();renderProgram();statusEl.textContent=`CPUを${CPU_CLASSES[cpuClass].name}（最大${cpuChipLimit()}チップ）に変更しました。超過分は自動整理しました。`;});
settingsGridEl.addEventListener('click',e=>{const cell=e.target.closest?.('.cell');if(!cell)return;const idx=[...settingsGridEl.children].indexOf(cell);if(idx<=0||programs[editSide][idx])return;if(cpuChipCount(programs[editSide])>=cpuChipLimit()){e.preventDefault();e.stopImmediatePropagation();statusEl.textContent=`CPU上限です：${CPU_CLASSES[cpuClass].name}は最大${cpuChipLimit()}チップです。`;updateCpuUsage();}},true);
sampleBtn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();programs[editSide]=trimProgramToCpu(randomProgram());selectedCell=1;state[editSide].pc=0;renderProgram();statusEl.textContent=`${editSide==='A'?'自機':'敵機'}をCPU上限${cpuChipLimit()}チップ以内でランダム配置しました。`;},true);
const baseSimCpu=simulateBattleWeaponAware;simulateBattleWeaponAware=function(pa,pb,seed,a1,a2,b1,b2){return baseSimCpu(trimProgramToCpu(pa),trimProgramToCpu(pb),seed,a1,a2,b1,b2);};
setTimeout(()=>{const baseOptimizeCpu=optimizeHybrid;optimizeHybrid=async function(maxGenerations=1000){applyCpuLimitAll();const r=await baseOptimizeCpu(maxGenerations);applyCpuLimitAll();renderProgram();if(typeof saveOptimizedResult==='function')saveOptimizedResult({cpuClass,cpuLimit:cpuChipLimit()});evoDetail.textContent+=` / CPU ${CPU_CLASSES[cpuClass].name} ${cpuChipLimit()}チップ`;return r;};updateCpuUsage();},0);
