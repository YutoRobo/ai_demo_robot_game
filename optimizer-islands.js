// 300-population behavior-cluster coevolution optimizer.
// Loaded inside the game closure by index.html.
const OPTIMIZER_STORAGE_KEY='robot-ai-battle-v2-optimized';
const EVOLUTION_DB='robot-ai-battle-evolution-v2';
let __lastEvolutionRunId=null;

function saveOptimizedResult(meta={}){
  try{
    const payload={version:2,savedAt:new Date().toISOString(),programs:{A:cloneProgram(programs.A),B:cloneProgram(programs.B)},weapons:{A1:weaponA1Sel.value,A2:weaponA2Sel.value,B1:weaponB1Sel.value,B2:weaponB2Sel.value},metrics:{gen:evoGen.textContent,battles:evoBattles.textContent,best:evoBest.textContent,detail:evoDetail.textContent},...meta};
    localStorage.setItem(OPTIMIZER_STORAGE_KEY,JSON.stringify(payload));
    lastOptimized={A:cloneProgram(programs.A),B:cloneProgram(programs.B)};
    return true;
  }catch(err){console.warn('optimized result save failed',err);return false;}
}
function restoreOptimizedResult(){
  try{
    const raw=localStorage.getItem(OPTIMIZER_STORAGE_KEY);if(!raw)return false;
    const saved=JSON.parse(raw);if(!saved||saved.version!==2||!saved.programs?.A||!saved.programs?.B)return false;
    programs.A=cloneProgram(saved.programs.A);programs.B=cloneProgram(saved.programs.B);
    if(saved.weapons){weaponA1Sel.value=saved.weapons.A1||weaponA1Sel.value;weaponA2Sel.value=saved.weapons.A2||weaponA2Sel.value;weaponB1Sel.value=saved.weapons.B1||weaponB1Sel.value;weaponB2Sel.value=saved.weapons.B2||weaponB2Sel.value;}
    lastOptimized={A:cloneProgram(programs.A),B:cloneProgram(programs.B)};editSide='A';selectedCell=1;
    state={A:{pc:0,acc:0,flag:false,timer:0,lastSeen:0,lastHp:100,hitRecent:0,lockTime:0},B:{pc:0,acc:0,flag:false,timer:0,lastSeen:0,lastHp:100,hitRecent:0,lockTime:0}};
    if(saved.metrics){evoGen.textContent=saved.metrics.gen||'-';evoBattles.textContent=saved.metrics.battles||'0';evoBest.textContent=saved.metrics.best||'-';evoDetail.textContent=(saved.metrics.detail||'保存済み探索結果')+' / 保存済み';evoProgress.style.width='100%';}
    renderProgram();return true;
  }catch(err){console.warn('optimized result restore failed',err);return false;}
}

function evoDbOpen(){return new Promise((resolve,reject)=>{const req=indexedDB.open(EVOLUTION_DB,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('runs'))db.createObjectStore('runs',{keyPath:'runId'});if(!db.objectStoreNames.contains('generations'))db.createObjectStore('generations',{keyPath:'key'});if(!db.objectStoreNames.contains('individuals'))db.createObjectStore('individuals',{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function evoDbPut(store,value){try{const db=await evoDbOpen();await new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();}catch(err){console.warn('evolution log write failed',err);}}
async function evoDbPutMany(store,values){if(!values?.length)return;try{const db=await evoDbOpen();await new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite'),os=tx.objectStore(store);for(const value of values)os.put(value);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();}catch(err){console.warn('evolution log batch write failed',err);}}
async function evoDbAll(store){const db=await evoDbOpen();const rows=await new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly'),req=tx.objectStore(store).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);});db.close();return rows;}
async function exportLastEvolutionRun(){if(!__lastEvolutionRunId){statusEl.textContent='このページではまだ探索ログがありません。';return;}try{const [runs,gens,inds]=await Promise.all([evoDbAll('runs'),evoDbAll('generations'),evoDbAll('individuals')]);const run=runs.find(x=>x.runId===__lastEvolutionRunId),payload={run,generations:gens.filter(x=>x.runId===__lastEvolutionRunId),individuals:inds.filter(x=>x.runId===__lastEvolutionRunId)};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`robot-ai-evolution-${__lastEvolutionRunId}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);statusEl.textContent='探索ログJSONを出力しました。';}catch(err){statusEl.textContent='探索ログ出力に失敗しました：'+(err?.message||err);}}
(function installLogButton(){const section=optimizeBtn.closest('.section');if(!section||root.querySelector('#evoLogBtn'))return;const b=document.createElement('button');b.type='button';b.id='evoLogBtn';b.textContent='探索ログ出力';b.addEventListener('click',exportLastEvolutionRun);section.querySelector('.controls')?.appendChild(b);})();

optimizeHybrid = async function(maxGenerations=1000){
  running=false;startBtn.textContent='戦闘開始';optimizeBtn.disabled=true;
  const ITER=Math.max(20,Math.min(20000,Math.floor(maxGenerations||1000))),POP=300,K=6,TARGET=50,ELITE=5,TRAIN_OPPS=12,VAL_EVERY=10,VAL_OPPS=12,TEST_OPPS=18;
  const weaponList=['rifle','burst','heavy','rapid','mine','killer'],weaponName={rifle:'ライフル',burst:'バースト',heavy:'ヘビー弾',rapid:'速射砲',mine:'地雷',killer:'強化弾'};
  const runId=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;__lastEvolutionRunId=runId;
  let battleCount=0,idSeq=0,bestValidation=null,centroids=null;const startIso=new Date().toISOString();
  const hall=Array.from({length:K},()=>[]),individualIndex=new Map();
  statusEl.textContent='300個体・6戦術クラスタで共進化探索を開始します。';evoProgress.style.width='0%';evoBattles.textContent='0';evoBest.textContent='-';
  await evoDbPut('runs',{runId,startedAt:startIso,population:POP,clusters:K,targetPerCluster:TARGET,trainOpponents:TRAIN_OPPS,maxGenerations:ITER,status:'running'});

  function sanitize(p){const n=cloneProgram(p||Array(36).fill(null));for(let i=1;i<36;i++){const c=n[i];if(!c)continue;if(c.type==='shoot')c.type='weapon1';if(c.type==='mine'||c.type==='killerShot')c.type='weapon2';if(!chipTypes.some(x=>x[0]===c.type))n[i]=randomChip();}if(!n[1])n[1]={type:'enemyInWideFov',kind:'cond',yes:'D',no:'R'};return typeof trimProgramToCpu==='function'?trimProgramToCpu(n):n;}
  function genome(p,w1,w2){return{p:sanitize(p),w1:weaponList.includes(w1)?w1:'rifle',w2:weaponList.includes(w2)?w2:'mine'};}
  function nextId(g){return `${runId}-G${String(g).padStart(4,'0')}-I${String(idSeq++).padStart(6,'0')}`;}
  function makeIndividual(g,genomeValue,parentIds=[]){const ind={id:nextId(g),birthGeneration:g,parentIds:[...parentIds],genome:genome(genomeValue.p,genomeValue.w1,genomeValue.w2),clusterId:0,nemesisIds:[],score:-Infinity,wr:0,behavior:[0,0,0,0,0,0,0,0]};individualIndex.set(ind.id,ind);return ind;}
  function cloneGenome(v){return{p:cloneProgram(v.p),w1:v.w1,w2:v.w2};}
  function sim(a,b,seed){return simulateBattleWeaponAware(a.genome.p,b.genome.p,seed,a.genome.w1,a.genome.w2,b.genome.w1,b.genome.w2);}
  function rand(arr){return arr[Math.floor(Math.random()*arr.length)];}
  function sampleUnique(pool,n,excludeId,set=new Set()){const out=[];if(!pool.length)return out;let guard=0;while(out.length<n&&guard++<pool.length*5+20){const x=rand(pool);if(!x||x.id===excludeId||set.has(x.id))continue;set.add(x.id);out.push(x);}return out;}
  function vecDist(a,b){let s=0;for(let i=0;i<a.length;i++){const d=a[i]-b[i];s+=d*d;}return s;}
  function meanVec(rows){const m=Array(8).fill(0);if(!rows.length)return m;for(const r of rows)for(let i=0;i<8;i++)m[i]+=r.behavior[i]||0;return m.map(x=>x/rows.length);}
  function aggregateStats(acc,st){if(!st)return;for(const k of ['shoot','killer','mine','evade','move','aim','turn','back','dist','ticks','visitedCount','damage'])acc[k]=(acc[k]||0)+Number(st[k]||0);}
  function behaviorFrom(acc){const ticks=Math.max(1,acc.ticks||0),att=(acc.shoot||0)+(acc.killer||0)+(acc.mine||0);return[Math.min(1,(acc.dist/ticks)/450),Math.min(1,(acc.move||0)/ticks*5),Math.min(1,(acc.evade||0)/ticks*8),Math.min(1,(acc.aim||0)/ticks*6),Math.min(1,att/ticks*8),Math.min(1,(acc.mine||0)/Math.max(1,att)),Math.min(1,(acc.turn||0)/ticks*6),Math.min(1,(acc.visitedCount||0)/Math.max(1,TRAIN_OPPS*24))];}
  function battleScore(wr,margin,resolved){const m=Math.max(-1,Math.min(1,margin/100));return 1000*(.92*wr+.05*((m+1)/2)+.03*resolved);}

  function chooseOpponents(ind,population){const used=new Set(),same=population.filter(x=>x.clusterId===ind.clusterId),other=population.filter(x=>x.clusterId!==ind.clusterId),hallPool=hall.flat();const nem=ind.nemesisIds.map(id=>individualIndex.get(id)).filter(Boolean);let out=[];out.push(...sampleUnique(same,4,ind.id,used));out.push(...sampleUnique(other,4,ind.id,used));out.push(...sampleUnique(hallPool,2,ind.id,used));out.push(...sampleUnique(nem,2,ind.id,used));if(out.length<TRAIN_OPPS)out.push(...sampleUnique(population,TRAIN_OPPS-out.length,ind.id,used));return out.slice(0,TRAIN_OPPS);}
  function evaluate(ind,opps,generation,seedBase){let wins=0,draws=0,losses=0,margin=0,resolved=0;const agg={},lossIds=[];for(let i=0;i<opps.length;i++){const q=opps[i],seed=seedBase+generation*1000003+i*17011;const r1=sim(ind,q,seed),r2=sim(q,ind,seed);battleCount+=2;for(const [r,side] of [[r1,1],[r2,-1]]){const win=side===1?r.winner>0:r.winner<0,loss=side===1?r.winner<0:r.winner>0;if(win)wins++;else if(loss){losses++;lossIds.push(q.id);}else draws++;if(r.resolved)resolved++;margin+=side===1?r.a-r.b:r.b-r.a;aggregateStats(agg,side===1?r.stats?.A:r.stats?.B);}}const games=Math.max(1,opps.length*2),wr=wins/games,rr=resolved/games,avgMargin=margin/games;ind.score=battleScore(wr,avgMargin,rr);ind.wr=wr;ind.behavior=behaviorFrom(agg);ind.lastEval={wins,draws,losses,wr,resolved:rr,avgMargin,opponentIds:opps.map(x=>x.id)};ind.nemesisIds=[...new Set(lossIds)].slice(-5);return ind;}

  function balancedCluster(population){if(!centroids){const sorted=[...population].sort((a,b)=>a.behavior[0]-b.behavior[0]);centroids=Array.from({length:K},(_,i)=>sorted[Math.min(sorted.length-1,Math.floor((i+.5)*sorted.length/K))].behavior.slice());}
    for(let iter=0;iter<3;iter++){const slots=Array(K).fill(TARGET),order=[...population].sort(()=>Math.random()-.5);for(const ind of order){let best=-1,bd=Infinity;for(let c=0;c<K;c++){if(slots[c]<=0)continue;const d=vecDist(ind.behavior,centroids[c]);if(d<bd){bd=d;best=c;}}if(best<0)best=slots.findIndex(x=>x>0);ind.clusterId=best;slots[best]--;}centroids=Array.from({length:K},(_,c)=>meanVec(population.filter(x=>x.clusterId===c)));}
  }
  function clusterGroups(pop){return Array.from({length:K},(_,c)=>pop.filter(x=>x.clusterId===c).sort((a,b)=>b.score-a.score));}
  function tournament(pool,k=4){let b=null;for(let i=0;i<k;i++){const x=rand(pool);if(!b||x.score>b.score)b=x;}return b;}
  function mutateGenome(g){const n=cloneGenome(g),p=cloneProgram(n.p),r=Math.random();if(r<.08)n.w1=rand(weaponList);else if(r<.16)n.w2=rand(weaponList);else{const filled=[];for(let i=1;i<36;i++)if(p[i])filled.push(i);if(r<.45&&filled.length){const pos=rand(filled),old=p[pos],same=chipTypes.filter(z=>z[2]===old.kind&&z[0]!==old.type);if(same.length)p[pos]={...old,type:rand(same)[0]};}else if(r<.70&&filled.length){const pos=rand(filled),c=p[pos],ds=dirs.map(x=>x[0]);if(c.kind==='action')c.next=rand(ds);else if(Math.random()<.5)c.yes=rand(ds);else c.no=rand(ds);}else if(r<.88){const empty=[];for(let i=1;i<36;i++)if(!p[i])empty.push(i);if(empty.length)p[rand(empty)]=randomChip();}else if(filled.length>6){const pos=rand(filled.filter(x=>x!==1));if(pos)p[pos]=null;}n.p=sanitize(p);}return n;}
  function crossoverGenome(a,b){const c=cloneGenome(a),x0=Math.floor(Math.random()*5),y0=Math.floor(Math.random()*5),w=1+Math.floor(Math.random()*(6-x0)),h=1+Math.floor(Math.random()*(6-y0));for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++){const i=y*6+x;if(i>0)c.p[i]=b.p[i]?{...b.p[i]}:null;}if(Math.random()<.35)c.w1=b.w1;if(Math.random()<.35)c.w2=b.w2;c.p=sanitize(c.p);return c;}
  function breedNext(population,generation){const groups=clusterGroups(population),next=[];for(let c=0;c<K;c++){const group=groups[c].length?groups[c]:population.slice().sort((a,b)=>b.score-a.score).slice(0,TARGET),elites=group.slice(0,ELITE);for(const e of elites){const copy=makeIndividual(generation+1,e.genome,[e.id]);copy.clusterId=c;copy.nemesisIds=[...e.nemesisIds];next.push(copy);}while(next.filter(x=>x.clusterId===c).length<TARGET){const p1=tournament(group),cross=Math.random()<.65,matePool=Math.random()<.15?population:group,p2=tournament(matePool);let g=cross?crossoverGenome(p1.genome,p2.genome):cloneGenome(p1.genome);g=mutateGenome(g);if(Math.random()<.22)g=mutateGenome(g);const child=makeIndividual(generation+1,g,cross?[p1.id,p2.id]:[p1.id]);child.clusterId=c;next.push(child);}}return next.slice(0,POP);}

  async function logGeneration(g,population,validation=null){const groups=clusterGroups(population),summary={runId,key:`${runId}:${String(g).padStart(6,'0')}`,generation:g,battleCount,clusters:groups.map((x,c)=>({clusterId:c,size:x.length,bestScore:x[0]?.score??null,meanScore:x.reduce((s,v)=>s+v.score,0)/Math.max(1,x.length),meanWinRate:x.reduce((s,v)=>s+v.wr,0)/Math.max(1,x.length),centroid:centroids?.[c]||null})),population:population.map(x=>({id:x.id,birthGeneration:x.birthGeneration,parents:x.parentIds,clusterId:x.clusterId,score:x.score,wr:x.wr,behavior:x.behavior,nemesisIds:x.nemesisIds,weapons:[x.genome.w1,x.genome.w2]})),validation};await evoDbPut('generations',summary);const important=[];for(const group of groups)for(const x of group.slice(0,ELITE))important.push({runId,id:x.id,birthGeneration:x.birthGeneration,parentIds:x.parentIds,clusterId:x.clusterId,program:cloneProgram(x.genome.p),weapons:[x.genome.w1,x.genome.w2],score:x.score,wr:x.wr,behavior:x.behavior});await evoDbPutMany('individuals',important);}
  function initializePopulation(){const seeds=weaponAwareSeeds(),starter=[];for(let i=0;i<POP;i++){let p,w1,w2;if(i<seeds.length*6){p=seeds[i%seeds.length];w1=weaponList[i%weaponList.length];w2=weaponList[(i*3+2)%weaponList.length];}else{p=randomProgram();w1=rand(weaponList);w2=rand(weaponList);}starter.push(makeIndividual(0,{p,w1,w2},[]));}return starter;}
  function updateHall(population){const groups=clusterGroups(population);for(let c=0;c<K;c++){for(const x of groups[c].slice(0,2)){hall[c].push(x);if(hall[c].length>8)hall[c].shift();}}}
  function validationOpponents(population){const groups=clusterGroups(population),out=[];for(const g of groups)out.push(...g.slice(0,2));return out.slice(0,VAL_OPPS);}
  function validateCandidates(population,generation){const groups=clusterGroups(population),cands=[];for(const g of groups)cands.push(...g.slice(0,2));const baseOpps=validationOpponents(population);let best=null;for(let ci=0;ci<cands.length;ci++){const shadow={...cands[ci],genome:cloneGenome(cands[ci].genome),nemesisIds:[...cands[ci].nemesisIds]},opps=baseOpps.filter(x=>x.id!==shadow.id);if(opps.length<VAL_OPPS)opps.push(...sampleUnique(population,VAL_OPPS-opps.length,shadow.id,new Set(opps.map(x=>x.id))));evaluate(shadow,opps.slice(0,VAL_OPPS),generation,1210000000+ci*50021);if(!best||shadow.score>best.score)best=shadow;}return best;}
  function finalTest(candidate,population){const fixed=[makeIndividual(ITER,{p:handDesignedChampion('A'),w1:'rifle',w2:'mine'},[]),makeIndividual(ITER,{p:handDesignedChampion('A'),w1:'heavy',w2:'rapid'},[]),makeIndividual(ITER,{p:handDesignedChampion('B'),w1:'burst',w2:'killer'},[]),makeIndividual(ITER,{p:strategicSeeds()[0],w1:'rapid',w2:'mine'},[]),makeIndividual(ITER,{p:strategicSeeds()[1],w1:'heavy',w2:'killer'},[])],mix=[...fixed,...validationOpponents(population),...hall.flat().slice(-6)].slice(0,TEST_OPPS),shadow={...candidate,genome:cloneGenome(candidate.genome),nemesisIds:[]};evaluate(shadow,mix,ITER+1,1600000000);return shadow;}

  let population=initializePopulation();
  // Bootstrap behavior using broad random opponents, then form balanced tactical clusters.
  for(let i=0;i<population.length;i++){const opps=sampleUnique(population,6,population[i].id);evaluate(population[i],opps,0,700000000+i*101);if(i%20===0)await new Promise(r=>setTimeout(r,0));}
  balancedCluster(population);updateHall(population);

  for(let g=0;g<ITER;g++){
    for(let i=0;i<population.length;i++){const ind=population[i],opps=chooseOpponents(ind,population);evaluate(ind,opps,g,900000000+i*23003);if(i%12===0)await new Promise(r=>setTimeout(r,0));}
    balancedCluster(population);updateHall(population);
    let val=null;if(g%VAL_EVERY===0||g===ITER-1){val=validateCandidates(population,g);if(val&&(!bestValidation||val.score>bestValidation.score))bestValidation={...val,genome:cloneGenome(val.genome)};}
    await logGeneration(g,population,val?{id:val.id,score:val.score,wr:val.wr,clusterId:val.clusterId}:null);
    const groups=clusterGroups(population),trainBest=groups.flat().sort((a,b)=>b.score-a.score)[0];
    evoGen.textContent=`${g+1} / ${ITER}`;evoBattles.textContent=String(battleCount);evoBest.textContent=(bestValidation?.score??trainBest?.score??0).toFixed(1);evoProgress.style.width=(((g+1)/ITER)*92).toFixed(1)+'%';evoDetail.textContent=`300個体 / 6戦術クラスタ各50 / Train首位 ${(trainBest?.wr*100||0).toFixed(1)}%${bestValidation?` / Validation ${(bestValidation.wr*100).toFixed(1)}%`:''} / 累積 ${battleCount} 戦`;
    if(g<ITER-1)population=breedNext(population,g);
  }

  const finalCandidate=bestValidation||population.slice().sort((a,b)=>b.score-a.score)[0],test=finalTest(finalCandidate,population),groups=clusterGroups(population),runner=groups.flat().filter(x=>x.id!==finalCandidate.id).sort((a,b)=>b.score-a.score)[0]||finalCandidate;
  programs.A=cloneProgram(finalCandidate.genome.p);programs.B=cloneProgram(runner.genome.p);weaponA1Sel.value=finalCandidate.genome.w1;weaponA2Sel.value=finalCandidate.genome.w2;weaponB1Sel.value=runner.genome.w1;weaponB2Sel.value=runner.genome.w2;editSide='A';selectedCell=1;state={A:{pc:0,acc:0,flag:false,timer:0,lastSeen:0,lastHp:100,hitRecent:0,lockTime:0},B:{pc:0,acc:0,flag:false,timer:0,lastSeen:0,lastHp:100,hitRecent:0,lockTime:0}};renderProgram();
  evoGen.textContent=`${ITER} + Test`;evoBattles.textContent=String(battleCount);evoBest.textContent=finalCandidate.score.toFixed(1);evoProgress.style.width='100%';evoDetail.textContent=`完了：300個体・6クラスタ / Validation ${(finalCandidate.wr*100).toFixed(1)}% / Test ${(test.wr*100).toFixed(1)}% / ${weaponName[finalCandidate.genome.w1]}＋${weaponName[finalCandidate.genome.w2]} / ログ ${runId}`;
  statusEl.textContent='探索完了。Validationで選んだ個体を盤面へ反映し、Testは選抜に使わず最終評価だけ行いました。';
  saveOptimizedResult({runId,optimizer:'behavior-cluster-300',population:POP,clusters:K,validation:{score:finalCandidate.score,winRate:finalCandidate.wr},test:{score:test.score,winRate:test.wr}});
  await evoDbPut('individuals',{runId,id:finalCandidate.id,birthGeneration:finalCandidate.birthGeneration,parentIds:finalCandidate.parentIds,clusterId:finalCandidate.clusterId,program:cloneProgram(finalCandidate.genome.p),weapons:[finalCandidate.genome.w1,finalCandidate.genome.w2],score:finalCandidate.score,wr:finalCandidate.wr,behavior:finalCandidate.behavior,isFinal:true});
  await evoDbPut('runs',{runId,startedAt:startIso,completedAt:new Date().toISOString(),population:POP,clusters:K,targetPerCluster:TARGET,trainOpponents:TRAIN_OPPS,maxGenerations:ITER,status:'complete',battleCount,finalId:finalCandidate.id,validationWinRate:finalCandidate.wr,testWinRate:test.wr});
  optimizeBtn.disabled=false;return{runId,final:finalCandidate,test};
};

setTimeout(()=>restoreOptimizedResult(),0);
