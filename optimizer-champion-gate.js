// Legacy fixed Champion Gate remains disabled.
// Sparse league evaluation keeps 300 individuals while avoiding 12-opponent evaluation for every individual.
const __SPARSE_OPTIMIZER_VERSION='behavior-cluster-300-sparse-v1';
optimizeHybrid=async function(maxGenerations=1000){
  running=false;startBtn.textContent='戦闘開始';optimizeBtn.disabled=true;
  const ITER=Math.max(20,Math.min(20000,Math.floor(maxGenerations||1000)));
  const POP=300,K=6,TARGET=50,ELITE=5,TRAIN_OPPS=2,DEEP_EVERY=5,DEEP_PER_CLUSTER=2,DEEP_OPPS=8,VAL_EVERY=10,VAL_OPPS=8,TEST_OPPS=12;
  const weaponList=['rifle','burst','heavy','rapid','mine','killer'];
  const weaponName={rifle:'ライフル',burst:'バースト',heavy:'ヘビー弾',rapid:'速射砲',mine:'地雷',killer:'強化弾'};
  const runId=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;__lastEvolutionRunId=runId;
  const hall=Array.from({length:K},()=>[]),individualIndex=new Map();
  let battleCount=0,idSeq=0,centroids=null,bestValidation=null,lastDeep=[];
  const startedAt=new Date().toISOString();

  statusEl.textContent='高速300個体探索を開始しました。通常評価は各個体2相手、上位だけ深掘り評価します。';
  evoGen.textContent='初期評価';evoBattles.textContent='0';evoBest.textContent='-';evoProgress.style.width='.5%';
  evoDetail.textContent='300個体を生成中…';
  await new Promise(r=>requestAnimationFrame(()=>r()));
  await evoDbPut('runs',{runId,startedAt,population:POP,clusters:K,targetPerCluster:TARGET,trainOpponents:TRAIN_OPPS,deepEvery:DEEP_EVERY,deepOpponents:DEEP_OPPS,maxGenerations:ITER,optimizer:__SPARSE_OPTIMIZER_VERSION,status:'running'});

  function rand(a){return a[Math.floor(Math.random()*a.length)];}
  function sanitize(p){
    const n=cloneProgram(p||Array(36).fill(null));
    for(let i=1;i<36;i++){
      const c=n[i];if(!c)continue;
      if(c.type==='shoot')c.type='weapon1';
      if(c.type==='mine'||c.type==='killerShot')c.type='weapon2';
      if(!chipTypes.some(x=>x[0]===c.type))n[i]=randomChip();
    }
    if(!n[1])n[1]={type:'enemyInWideFov',kind:'cond',yes:'D',no:'R'};
    return typeof trimProgramToCpu==='function'?trimProgramToCpu(n):n;
  }
  function genome(p,w1,w2){return{p:sanitize(p),w1:weaponList.includes(w1)?w1:'rifle',w2:weaponList.includes(w2)?w2:'mine'};}
  function cloneGenome(g){return{p:cloneProgram(g.p),w1:g.w1,w2:g.w2};}
  function nextId(g){return`${runId}-G${String(g).padStart(4,'0')}-I${String(idSeq++).padStart(6,'0')}`;}
  function makeIndividual(g,gene,parents=[]){const x={id:nextId(g),birthGeneration:g,parentIds:[...parents],genome:genome(gene.p,gene.w1,gene.w2),clusterId:0,nemesisIds:[],score:-Infinity,wr:0,behavior:[0,0,0,0,0,0,0,0],lastEval:null};individualIndex.set(x.id,x);return x;}
  function sampleUnique(pool,n,excludeId,used=new Set()){
    const out=[];if(!pool.length)return out;let guard=0;
    while(out.length<n&&guard++<pool.length*8+30){const x=rand(pool);if(!x||x.id===excludeId||used.has(x.id))continue;used.add(x.id);out.push(x);}return out;
  }
  function vecDist(a,b){let s=0;for(let i=0;i<a.length;i++){const d=(a[i]||0)-(b[i]||0);s+=d*d;}return s;}
  function meanVec(rows){const m=Array(8).fill(0);if(!rows.length)return m;for(const r of rows)for(let i=0;i<8;i++)m[i]+=r.behavior[i]||0;return m.map(v=>v/rows.length);}
  function addStats(acc,st){if(!st)return;for(const k of ['shoot','killer','mine','evade','move','aim','turn','back','dist','ticks','visitedCount','damage'])acc[k]=(acc[k]||0)+Number(st[k]||0);}
  function behaviorFrom(acc,games){const ticks=Math.max(1,acc.ticks||0),att=(acc.shoot||0)+(acc.killer||0)+(acc.mine||0);return[Math.min(1,(acc.dist/ticks)/450),Math.min(1,(acc.move||0)/ticks*5),Math.min(1,(acc.evade||0)/ticks*8),Math.min(1,(acc.aim||0)/ticks*6),Math.min(1,att/ticks*8),Math.min(1,(acc.mine||0)/Math.max(1,att)),Math.min(1,(acc.turn||0)/ticks*6),Math.min(1,(acc.visitedCount||0)/Math.max(1,games*12))];}
  function scoreOf(wr,margin,resolved){const m=Math.max(-1,Math.min(1,margin/100));return 1000*(.92*wr+.05*((m+1)/2)+.03*resolved);}
  function runEval(ind,opps,generation,seedBase){
    let wins=0,draws=0,losses=0,margin=0,resolved=0;const agg={},lossIds=[];
    for(let i=0;i<opps.length;i++){
      const q=opps[i],seed=seedBase+generation*1000003+i*17011;
      const r1=simulateBattleWeaponAware(ind.genome.p,q.genome.p,seed,ind.genome.w1,ind.genome.w2,q.genome.w1,q.genome.w2);
      const r2=simulateBattleWeaponAware(q.genome.p,ind.genome.p,seed,q.genome.w1,q.genome.w2,ind.genome.w1,ind.genome.w2);battleCount+=2;
      for(const [r,side] of [[r1,1],[r2,-1]]){
        const win=side===1?r.winner>0:r.winner<0,loss=side===1?r.winner<0:r.winner>0;
        if(win)wins++;else if(loss){losses++;lossIds.push(q.id);}else draws++;
        if(r.resolved)resolved++;margin+=side===1?r.a-r.b:r.b-r.a;addStats(agg,side===1?r.stats?.A:r.stats?.B);
      }
    }
    const games=Math.max(1,opps.length*2),wr=wins/games,rr=resolved/games,avgMargin=margin/games;
    return{score:scoreOf(wr,avgMargin,rr),wr,wins,draws,losses,resolved:rr,avgMargin,behavior:behaviorFrom(agg,games),nemesisIds:[...new Set(lossIds)].slice(-5),opponentIds:opps.map(x=>x.id)};
  }
  function applyEval(ind,r){ind.score=r.score;ind.wr=r.wr;ind.behavior=r.behavior;ind.nemesisIds=r.nemesisIds;ind.lastEval=r;return ind;}
  function balancedCluster(pop){
    if(!centroids){const sorted=[...pop].sort((a,b)=>a.behavior[0]-b.behavior[0]);centroids=Array.from({length:K},(_,i)=>sorted[Math.min(sorted.length-1,Math.floor((i+.5)*sorted.length/K))].behavior.slice());}
    for(let pass=0;pass<3;pass++){
      const slots=Array(K).fill(TARGET),order=[...pop].sort(()=>Math.random()-.5);
      for(const ind of order){let best=-1,bd=Infinity;for(let c=0;c<K;c++){if(slots[c]<=0)continue;const d=vecDist(ind.behavior,centroids[c]);if(d<bd){bd=d;best=c;}}if(best<0)best=slots.findIndex(v=>v>0);ind.clusterId=best;slots[best]--;}
      centroids=Array.from({length:K},(_,c)=>meanVec(pop.filter(x=>x.clusterId===c)));
    }
  }
  function groups(pop){return Array.from({length:K},(_,c)=>pop.filter(x=>x.clusterId===c).sort((a,b)=>b.score-a.score));}
  function tournament(pool,k=4){let b=null;for(let i=0;i<k;i++){const x=rand(pool);if(!b||x.score>b.score)b=x;}return b;}
  function chooseTrainOpponents(ind,pop,generation){
    const used=new Set(),same=pop.filter(x=>x.clusterId===ind.clusterId),other=pop.filter(x=>x.clusterId!==ind.clusterId),nem=ind.nemesisIds.map(id=>individualIndex.get(id)).filter(Boolean),hp=hall.flat();
    const out=[];out.push(...sampleUnique(same,1,ind.id,used));
    const league=(generation%3===0&&nem.length)?nem:(generation%3===1&&hp.length)?hp:other;
    out.push(...sampleUnique(league,1,ind.id,used));
    if(out.length<TRAIN_OPPS)out.push(...sampleUnique(other,TRAIN_OPPS-out.length,ind.id,used));
    if(out.length<TRAIN_OPPS)out.push(...sampleUnique(pop,TRAIN_OPPS-out.length,ind.id,used));
    return out.slice(0,TRAIN_OPPS);
  }
  function mutateGenome(g){
    const n=cloneGenome(g),p=cloneProgram(n.p),r=Math.random();
    if(r<.08)n.w1=rand(weaponList);else if(r<.16)n.w2=rand(weaponList);else{
      const filled=[];for(let i=1;i<36;i++)if(p[i])filled.push(i);
      if(r<.45&&filled.length){const pos=rand(filled),old=p[pos],same=chipTypes.filter(z=>z[2]===old.kind&&z[0]!==old.type);if(same.length)p[pos]={...old,type:rand(same)[0]};}
      else if(r<.70&&filled.length){const pos=rand(filled),c=p[pos],ds=dirs.map(x=>x[0]);if(c.kind==='action')c.next=rand(ds);else if(Math.random()<.5)c.yes=rand(ds);else c.no=rand(ds);}
      else if(r<.88){const empty=[];for(let i=1;i<36;i++)if(!p[i])empty.push(i);if(empty.length)p[rand(empty)]=randomChip();}
      else if(filled.length>6){const choices=filled.filter(x=>x!==1);if(choices.length)p[rand(choices)]=null;}
      n.p=sanitize(p);
    }return n;
  }
  function crossoverGenome(a,b){const c=cloneGenome(a),x0=Math.floor(Math.random()*5),y0=Math.floor(Math.random()*5),w=1+Math.floor(Math.random()*(6-x0)),h=1+Math.floor(Math.random()*(6-y0));for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++){const i=y*6+x;if(i>0)c.p[i]=b.p[i]?{...b.p[i]}:null;}if(Math.random()<.35)c.w1=b.w1;if(Math.random()<.35)c.w2=b.w2;c.p=sanitize(c.p);return c;}
  function breed(pop,generation){
    const gs=groups(pop),next=[];
    for(let c=0;c<K;c++){
      const pool=gs[c].length?gs[c]:[...pop].sort((a,b)=>b.score-a.score).slice(0,TARGET),elite=pool.slice(0,ELITE);
      for(const e of elite){const x=makeIndividual(generation,e.genome,[e.id]);x.clusterId=c;x.nemesisIds=[...e.nemesisIds];next.push(x);}
      let count=elite.length;
      while(count<TARGET){const p1=tournament(pool),cross=Math.random()<.65,p2=tournament(Math.random()<.15?pop:pool);let gene=cross?crossoverGenome(p1.genome,p2.genome):cloneGenome(p1.genome);gene=mutateGenome(gene);if(Math.random()<.22)gene=mutateGenome(gene);const x=makeIndividual(generation,gene,cross?[p1.id,p2.id]:[p1.id]);x.clusterId=c;x.nemesisIds=[...p1.nemesisIds];next.push(x);count++;}
    }return next.slice(0,POP);
  }
  function initPopulation(){const seeds=weaponAwareSeeds(),out=[];for(let i=0;i<POP;i++){let p,w1,w2;if(i<seeds.length*6){p=seeds[i%seeds.length];w1=weaponList[i%6];w2=weaponList[(i*3+2)%6];}else{p=randomProgram();w1=rand(weaponList);w2=rand(weaponList);}out.push(makeIndividual(0,{p,w1,w2},[]));}return out;}
  function deepCandidates(pop){const out=[];for(const g of groups(pop))out.push(...g.slice(0,DEEP_PER_CLUSTER));return out;}
  function mixedOpponents(ind,pop,n,seedOffset=0){
    const used=new Set(),out=[],gs=groups(pop),hp=hall.flat();
    for(let c=0;c<K&&out.length<n;c++)out.push(...sampleUnique(gs[(c+seedOffset)%K],1,ind.id,used));
    if(out.length<n)out.push(...sampleUnique(hp,n-out.length,ind.id,used));
    if(out.length<n)out.push(...sampleUnique(pop,n-out.length,ind.id,used));
    return out.slice(0,n);
  }
  function runDeep(pop,generation){
    const rows=[];for(const x of deepCandidates(pop)){const shadow={...x,genome:cloneGenome(x.genome),nemesisIds:[...x.nemesisIds]},opps=mixedOpponents(x,pop,DEEP_OPPS,generation);const r=runEval(shadow,opps,generation,1110000000+x.clusterId*70001);rows.push({source:x,eval:r});}
    for(let c=0;c<K;c++){const best=rows.filter(z=>z.source.clusterId===c).sort((a,b)=>b.eval.score-a.eval.score)[0];if(best){const snap={...best.source,genome:cloneGenome(best.source.genome),score:best.eval.score,wr:best.eval.wr,behavior:best.eval.behavior,nemesisIds:best.eval.nemesisIds};hall[c].push(snap);if(hall[c].length>8)hall[c].shift();}}
    return rows;
  }
  function validate(pop,generation,candidateRows){
    const candidates=(candidateRows?.length?candidateRows:deepCandidates(pop).map(x=>({source:x}))).map(z=>z.source),baselines=[
      makeIndividual(generation,{p:handDesignedChampion('A'),w1:'rifle',w2:'mine'},[]),makeIndividual(generation,{p:handDesignedChampion('A'),w1:'heavy',w2:'rapid'},[]),makeIndividual(generation,{p:handDesignedChampion('B'),w1:'burst',w2:'killer'},[]),makeIndividual(generation,{p:strategicSeeds()[0],w1:'rapid',w2:'mine'},[])
    ];
    const validationPool=[...baselines,...hall.flat(),...groups(pop).flatMap(g=>g.slice(0,2))];let best=null;
    for(let i=0;i<candidates.length;i++){const x=candidates[i],used=new Set(),opps=[];opps.push(...sampleUnique(baselines,Math.min(4,VAL_OPPS),x.id,used));if(opps.length<VAL_OPPS)opps.push(...sampleUnique(validationPool,VAL_OPPS-opps.length,x.id,used));const shadow={...x,genome:cloneGenome(x.genome),nemesisIds:[]},r=runEval(shadow,opps.slice(0,VAL_OPPS),generation,1310000000+i*50021);if(!best||r.score>best.eval.score)best={source:x,eval:r,genome:cloneGenome(x.genome)};}
    return best;
  }
  async function logGeneration(g,pop,deepRows,val){
    const gs=groups(pop),summary={runId,key:`${runId}:${String(g).padStart(6,'0')}`,generation:g,battleCount,optimizer:__SPARSE_OPTIMIZER_VERSION,clusters:gs.map((x,c)=>({clusterId:c,size:x.length,bestScore:x[0]?.score??null,meanScore:x.reduce((s,v)=>s+v.score,0)/Math.max(1,x.length),meanWinRate:x.reduce((s,v)=>s+v.wr,0)/Math.max(1,x.length),centroid:centroids?.[c]||null})),population:pop.map(x=>({id:x.id,birthGeneration:x.birthGeneration,parents:x.parentIds,clusterId:x.clusterId,score:x.score,wr:x.wr,behavior:x.behavior,nemesisIds:x.nemesisIds,weapons:[x.genome.w1,x.genome.w2]})),deep:deepRows?.map(z=>({id:z.source.id,clusterId:z.source.clusterId,score:z.eval.score,wr:z.eval.wr}))||null,validation:val?{id:val.source.id,score:val.eval.score,wr:val.eval.wr,clusterId:val.source.clusterId}:null};
    await evoDbPut('generations',summary);const important=[];for(const g0 of gs)for(const x of g0.slice(0,ELITE))important.push({runId,id:x.id,birthGeneration:x.birthGeneration,parentIds:x.parentIds,clusterId:x.clusterId,program:cloneProgram(x.genome.p),weapons:[x.genome.w1,x.genome.w2],score:x.score,wr:x.wr,behavior:x.behavior});await evoDbPutMany('individuals',important);
  }

  let population=initPopulation();
  for(let i=0;i<POP;i++){
    const opps=sampleUnique(population,TRAIN_OPPS,population[i].id);applyEval(population[i],runEval(population[i],opps,0,700000000+i*101));
    if(i%20===19||i===POP-1){evoGen.textContent='初期評価';evoBattles.textContent=String(battleCount);evoProgress.style.width=(1+7*(i+1)/POP).toFixed(1)+'%';evoDetail.textContent=`初期評価 ${i+1}/300 ・ 累積 ${battleCount}戦`;await new Promise(r=>setTimeout(r,0));}
  }
  balancedCluster(population);lastDeep=runDeep(population,0);
  bestValidation=validate(population,0,lastDeep);
  await logGeneration(0,population,lastDeep,bestValidation);

  for(let g=1;g<=ITER;g++){
    population=breed(population,g);
    for(let i=0;i<POP;i++){
      const ind=population[i],opps=chooseTrainOpponents(ind,population,g);applyEval(ind,runEval(ind,opps,g,900000000+i*23003));
      if(i%25===24||i===POP-1){evoGen.textContent=`${g} / ${ITER}`;evoBattles.textContent=String(battleCount);evoProgress.style.width=(8+84*((g-1)+(i+1)/POP)/ITER).toFixed(1)+'%';evoDetail.textContent=`300個体・疎評価：世代${g} ${i+1}/300 ・ 各個体${TRAIN_OPPS}相手 ・ 累積${battleCount}戦`;await new Promise(r=>setTimeout(r,0));}
    }
    balancedCluster(population);
    let deepRows=null;if(g%DEEP_EVERY===0||g===ITER){deepRows=runDeep(population,g);lastDeep=deepRows;}
    let val=null;if(g%VAL_EVERY===0||g===ITER){val=validate(population,g,deepRows||lastDeep);if(val&&(!bestValidation||val.eval.score>bestValidation.eval.score))bestValidation={source:{...val.source,genome:cloneGenome(val.source.genome)},eval:{...val.eval},genome:cloneGenome(val.genome)};}
    await logGeneration(g,population,deepRows,val);
    const trainBest=[...population].sort((a,b)=>b.score-a.score)[0];evoBest.textContent=(bestValidation?.eval.score??trainBest.score).toFixed(1);evoDetail.textContent=`300個体 / 6戦術クラスタ各50 / Train首位 ${(trainBest.wr*100).toFixed(1)}%${bestValidation?` / Validation ${(bestValidation.eval.wr*100).toFixed(1)}%`:''} / 累積 ${battleCount}戦`;
  }

  const finalSource=bestValidation?.source||[...population].sort((a,b)=>b.score-a.score)[0],finalGenome=bestValidation?.genome||cloneGenome(finalSource.genome);
  const finalObj={...finalSource,genome:cloneGenome(finalGenome)},testPool=[];
  const fixed=[makeIndividual(ITER+1,{p:handDesignedChampion('A'),w1:'rifle',w2:'mine'},[]),makeIndividual(ITER+1,{p:handDesignedChampion('A'),w1:'heavy',w2:'rapid'},[]),makeIndividual(ITER+1,{p:handDesignedChampion('B'),w1:'burst',w2:'killer'},[]),makeIndividual(ITER+1,{p:strategicSeeds()[0],w1:'rapid',w2:'mine'},[]),makeIndividual(ITER+1,{p:strategicSeeds()[1],w1:'heavy',w2:'killer'},[])];
  testPool.push(...fixed);const used=new Set(testPool.map(x=>x.id));testPool.push(...sampleUnique(hall.flat(),TEST_OPPS-testPool.length,finalObj.id,used));if(testPool.length<TEST_OPPS)testPool.push(...sampleUnique(population,TEST_OPPS-testPool.length,finalObj.id,used));
  const test=runEval(finalObj,testPool.slice(0,TEST_OPPS),ITER+1,1600000000);
  const runner=[...population].filter(x=>x.id!==finalSource.id).sort((a,b)=>b.score-a.score)[0]||finalSource;
  programs.A=cloneProgram(finalGenome.p);programs.B=cloneProgram(runner.genome.p);weaponA1Sel.value=finalGenome.w1;weaponA2Sel.value=finalGenome.w2;weaponB1Sel.value=runner.genome.w1;weaponB2Sel.value=runner.genome.w2;editSide='A';selectedCell=1;state={A:{pc:0,acc:0,flag:false,timer:0,lastSeen:0,lastHp:100,hitRecent:0,lockTime:0},B:{pc:0,acc:0,flag:false,timer:0,lastSeen:0,lastHp:100,hitRecent:0,lockTime:0}};renderProgram();
  evoGen.textContent=`${ITER} + Test`;evoBattles.textContent=String(battleCount);evoBest.textContent=(bestValidation?.eval.score??finalSource.score).toFixed(1);evoProgress.style.width='100%';evoDetail.textContent=`完了：300個体・疎評価 / Validation ${((bestValidation?.eval.wr??finalSource.wr)*100).toFixed(1)}% / Test ${(test.wr*100).toFixed(1)}% / ${weaponName[finalGenome.w1]}＋${weaponName[finalGenome.w2]} / 累積 ${battleCount}戦 / ログ ${runId}`;
  statusEl.textContent='探索完了。300個体は維持し、通常評価を疎化して上位だけ深掘りしました。';
  saveOptimizedResult({runId,optimizer:__SPARSE_OPTIMIZER_VERSION,population:POP,clusters:K,trainOpponents:TRAIN_OPPS,deepEvery:DEEP_EVERY,deepOpponents:DEEP_OPPS,validation:{score:bestValidation?.eval.score??finalSource.score,winRate:bestValidation?.eval.wr??finalSource.wr},test:{score:test.score,winRate:test.wr}});
  await evoDbPut('individuals',{runId,id:finalSource.id,birthGeneration:finalSource.birthGeneration,parentIds:finalSource.parentIds,clusterId:finalSource.clusterId,program:cloneProgram(finalGenome.p),weapons:[finalGenome.w1,finalGenome.w2],score:bestValidation?.eval.score??finalSource.score,wr:bestValidation?.eval.wr??finalSource.wr,behavior:bestValidation?.eval.behavior??finalSource.behavior,isFinal:true});
  await evoDbPut('runs',{runId,startedAt,completedAt:new Date().toISOString(),population:POP,clusters:K,targetPerCluster:TARGET,trainOpponents:TRAIN_OPPS,deepEvery:DEEP_EVERY,deepOpponents:DEEP_OPPS,maxGenerations:ITER,optimizer:__SPARSE_OPTIMIZER_VERSION,status:'complete',battleCount,finalId:finalSource.id,validationWinRate:bestValidation?.eval.wr??finalSource.wr,testWinRate:test.wr});
  optimizeBtn.disabled=false;return{runId,final:finalSource,test};
};
