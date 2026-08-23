// Phase D: isolated 300-population / 6-cluster / 20-generation integration validation.
// Uses the production authoritative-measured simulator, v0.4 metadata structural engine,
// exact runtime genome hashing, balanced behavior clustering, elites, and HOF snapshots.
(function installPhaseD(){
  const VERSION='phase-d-300x6-v0.1';
  const POP=300,K=6,PER_CLUSTER=50,GENERATIONS=20,ELITES_PER_CLUSTER=5;
  const COARSE_OPPS=2,DEEP_OPPS=4,DEEP_PER_CLUSTER=5;
  const MUTATION_SHARE=.80,CROSSOVER_SHARE=.20;
  const WEAPONS=['rifle','burst','heavy','rapid','mine','killer'];
  const evo=()=>window.__structuralEvolution;
  const clone=p=>cloneProgram(p);
  const programHash=p=>{let h=2166136261>>>0,s=JSON.stringify(p);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return h.toString(16).padStart(8,'0');};
  const genomeHash=x=>programHash(x.program)+'|'+x.weapons.join('|');
  const rngFactory=seed=>{let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};};
  const pick=(a,r)=>a[Math.floor(r()*a.length)];
  const pct=x=>(100*x).toFixed(1)+'%';
  let sequence=0;

  function baselineIndividuals(){
    const ps=[handDesignedChampion('A'),handDesignedChampion('B'),...strategicSeeds()];
    const ws=[['rifle','mine'],['heavy','rapid'],['burst','killer'],['rapid','mine'],['heavy','killer'],['rifle','rapid']];
    return ps.map((p,i)=>({id:'baseline-'+i,program:clone(p),hash:programHash(p),weapons:ws[i%ws.length].slice(),operator:'baseline',parents:[],birthGeneration:-1}));
  }
  function makeIndividual(program,weapons,operator,parents,generation){
    return{id:'d-'+generation+'-'+(++sequence),program:clone(program),hash:programHash(program),weapons:weapons.slice(),operator,parents:parents.slice(),birthGeneration:generation,cluster:null,eval:null,deepEval:null};
  }
  function assertStructure(ind,counters){
    const E=evo(),h=E.structureHealth(ind.program);
    if(!h.valid){counters.invalidToEvaluation++;return false;}
    const runtime=trimProgramToCpu(ind.program),rh=programHash(runtime);
    if(rh!==ind.hash){counters.runtimeHashViolations++;return false;}
    return true;
  }
  function makeInitial(rng,counters){
    const E=evo(),bases=baselineIndividuals().filter(x=>E.structureHealth(x.program).valid),out=[],seen=new Set();let guard=0;
    while(out.length<POP&&guard++<12000){
      const b=bases[out.length%bases.length];let p=clone(b.program),op='seed',parents=[b.id],w=b.weapons.slice();
      if(out.length>=bases.length){const m=E.mutateStructured(p,rng);p=m.program;op=m.operator;if(rng()<.18)w[Math.floor(rng()*2)]=pick(WEAPONS,rng);}
      const h=E.structureHealth(p);if(!h.valid)continue;
      const ind=makeIndividual(p,w,op,parents,0),sig=genomeHash(ind);if(seen.has(sig)&&guard<6000)continue;seen.add(sig);out.push(ind);
    }
    if(out.length!==POP)throw new Error('initial population generation failed: '+out.length);
    return out;
  }

  function emptyMetrics(){return{games:0,wins:0,draws:0,losses:0,resolved:0,margin:0,damage:0,attacks:0,translation:0,orientation:0,nonCombatGames:0,attackGames:0,damageGames:0,fovConditionGames:0,visited:0,dist:0,ticks:0,mineUses:0};}
  function addSide(m,r,side){
    const st=r.stats?.[side]||{},ac=r.activity?.[side]||{},candidateIsA=side==='A';
    const won=candidateIsA?r.winner>0:r.winner<0, lost=candidateIsA?r.winner<0:r.winner>0;
    m.games++;if(won)m.wins++;else if(lost)m.losses++;else m.draws++;if(r.resolved)m.resolved++;
    m.margin+=candidateIsA?(r.a-r.b):(r.b-r.a);
    const attacks=Number(ac.attacks??((st.shoot||0)+(st.mine||0)+(st.killer||0))),damage=Number(ac.damage??st.damage??0);
    m.attacks+=attacks;m.damage+=damage;m.translation+=Number(ac.translation??((st.move||0)+(st.evade||0)));m.orientation+=Number(ac.orientation??((st.turn||0)+(st.aim||0));
    if(ac.nonCombat===true||(attacks===0&&damage===0))m.nonCombatGames++;if(attacks>0)m.attackGames++;if(damage>0)m.damageGames++;
    if((st.narrowChecks||0)+(st.mediumChecks||0)+(st.wideChecks||0)>0)m.fovConditionGames++;
    m.visited+=Number(st.visitedCount||0);m.dist+=Number(st.dist||0);m.ticks+=Number(st.ticks||0);m.mineUses+=Number(st.mine||0);
  }
  function finalizeMetrics(m){
    const g=Math.max(1,m.games),t=Math.max(1,m.ticks);
    return{...m,winRate:m.wins/g,resolvedRate:m.resolved/g,nonCombatRate:m.nonCombatGames/g,attackGameRate:m.attackGames/g,damageGameRate:m.damageGames/g,fovConditionUseRate:m.fovConditionGames/g,avgDamage:m.damage/g,avgAttacks:m.attacks/g,avgTranslation:m.translation/g,avgOrientation:m.orientation/g,avgVisited:m.visited/g,meanDistance:m.dist/t,behavior:[m.dist/t,m.translation/g,m.orientation/g,m.attacks/g,m.mineUses/g,m.visited/g,m.nonCombatGames/g]};
  }
  function evalIndividual(ind,opponents,seeds,counters){
    const before=programHash(ind.program);if(!assertStructure(ind,counters))return{...finalizeMetrics(emptyMetrics()),invalid:true};
    const m=emptyMetrics();
    for(let i=0;i<opponents.length;i++){
      const q=opponents[i],seed=seeds[i%seeds.length];
      const r1=simulateBattleWeaponAware(ind.program,q.program,seed,ind.weapons[0],ind.weapons[1],q.weapons[0],q.weapons[1]);
      const r2=simulateBattleWeaponAware(q.program,ind.program,seed,q.weapons[0],q.weapons[1],ind.weapons[0],ind.weapons[1]);
      counters.battles+=2;addSide(m,r1,'A');addSide(m,r2,'B');
    }
    if(programHash(ind.program)!==before){counters.programHashViolations++;return{...finalizeMetrics(m),invalid:true};}
    return finalizeMetrics(m);
  }
  function stronger(a,b,key='eval'){
    const A=a[key],B=b[key];if(!B)return true;if(!A)return false;
    for(const k of ['wins','damage','resolved','margin'])if(A[k]!==B[k])return A[k]>B[k];
    return a.hash<b.hash;
  }
  function normalize(vs){const d=vs[0]?.length||0,lo=Array(d).fill(Infinity),hi=Array(d).fill(-Infinity);for(const v of vs)for(let j=0;j<d;j++){lo[j]=Math.min(lo[j],v[j]);hi[j]=Math.max(hi[j],v[j]);}return vs.map(v=>v.map((x,j)=>(x-lo[j])/(hi[j]-lo[j]||1)));}
  function balancedClusters(items){
    const vecs=normalize(items.map(x=>x.eval.behavior)),centers=[];for(let c=0;c<K;c++)centers.push(vecs[Math.floor(c*vecs.length/K)]?.slice()||Array(7).fill(0));
    const assign=Array(items.length).fill(-1);
    for(let it=0;it<7;it++){
      const opts=[];for(let i=0;i<items.length;i++)for(let c=0;c<K;c++){let d=0;for(let j=0;j<vecs[i].length;j++)d+=(vecs[i][j]-centers[c][j])**2;opts.push({i,c,d});}
      opts.sort((a,b)=>a.d-b.d);assign.fill(-1);const cap=Array(K).fill(0);
      for(const o of opts)if(assign[o.i]<0&&cap[o.c]<PER_CLUSTER){assign[o.i]=o.c;cap[o.c]++;}
      for(let c=0;c<K;c++){const ids=[];for(let i=0;i<assign.length;i++)if(assign[i]===c)ids.push(i);if(ids.length)for(let j=0;j<centers[c].length;j++)centers[c][j]=ids.reduce((s,i)=>s+vecs[i][j],0)/ids.length;}
    }
    return assign;
  }
  function tournament(pool,rng){let best=null;for(let k=0;k<Math.min(4,pool.length);k++){const x=pick(pool,rng);if(!best||stronger(x,best))best=x;}return best;}
  function mutateGenome(parent,rng,generation){
    const E=evo();let p=parent.program,w=parent.weapons.slice(),op='weaponProfileMutation';
    if(rng()<.15)w[Math.floor(rng()*2)]=pick(WEAPONS,rng);else{const m=E.mutateStructured(parent.program,rng);p=m.program;op=m.operator;}
    return makeIndividual(p,w,op,[parent.id],generation);
  }
  function crossGenome(a,b,rng,generation){
    const E=evo(),r=E.crossoverSubgraph(a.program,b.program,rng);if(!r)return mutateGenome(a,rng,generation);
    const w=[rng()<.5?a.weapons[0]:b.weapons[0],rng()<.5?a.weapons[1]:b.weapons[1]];
    return makeIndividual(r.program,w,'subgraphCrossover',[a.id,b.id],generation);
  }
  function groupByCluster(pop){const g=Array.from({length:K},()=>[]);for(const x of pop)g[x.cluster].push(x);return g;}
  function chooseOpponents(pool,n,offset){const out=[];if(!pool.length)return out;for(let i=0;i<n;i++)out.push(pool[(offset+i*7)%pool.length]);return out;}
  function aggregatePopulation(pop){const m=emptyMetrics();for(const x of pop){const e=x.eval;if(!e)continue;for(const k of Object.keys(m))if(typeof m[k]==='number')m[k]+=Number(e[k]||0);}return finalizeMetrics(m);}
  function snapshot(x){return{id:'hof-'+x.id,program:clone(x.program),hash:x.hash,weapons:x.weapons.slice(),operator:'hof',parents:[x.id],birthGeneration:x.birthGeneration,cluster:x.cluster,eval:x.eval?{...x.eval,behavior:x.eval.behavior.slice()}:null};}

  async function run(){
    const E=evo();if(!E||E.VERSION!=='grid-native-structure-v0.4-metadata')throw new Error('v0.4 metadata structural engine not loaded');
    if(!simulateBattleWeaponAware?.__authoritativeMeasured)throw new Error('authoritative-measured simulator not loaded');
    E.cfg.operatorWeights.extendBranch=0;E.cfg.disabledOperators=['redirectEdge','extendBranch'];
    const counters={battles:0,invalidToEvaluation:0,runtimeHashViolations:0,programHashViolations:0,eliteHashViolations:0,clusterMigrations:0,mutationChildren:0,crossoverChildren:0,parentCopies:0};
    const rng=rngFactory(26082404),baselines=baselineIndividuals();let population=makeInitial(rng,counters),hof=baselines.map(snapshot),log=[];
    const originalChassis={A:chassisBySide.A,B:chassisBySide.B};chassisBySide.A=phaseChassisSel.value;chassisBySide.B=phaseChassisSel.value;
    try{
      for(let g=0;g<GENERATIONS;g++){
        phaseStatus.textContent=`Phase D 実行中：${g+1}/${GENERATIONS}世代・Coarse評価…`;
        const opponentPool=[...baselines,...hof],coarseOpps=chooseOpponents(opponentPool,COARSE_OPPS,g*3),coarseSeeds=Array.from({length:COARSE_OPPS},(_,i)=>1700000000+g*10007+i*1009);
        for(let i=0;i<population.length;i++){population[i].eval=evalIndividual(population[i],coarseOpps,coarseSeeds,counters);if(i%30===29)await new Promise(r=>setTimeout(r,0));}
        const assign=balancedClusters(population);for(let i=0;i<population.length;i++){const old=population[i].cluster;population[i].cluster=assign[i];if(old!=null&&old!==assign[i])counters.clusterMigrations++;}
        const groups=groupByCluster(population),deepOpps=chooseOpponents(opponentPool,DEEP_OPPS,g*5+1),deepSeeds=Array.from({length:DEEP_OPPS},(_,i)=>1800000000+g*12011+i*1301),leaders=[];
        for(let c=0;c<K;c++){
          groups[c].sort((a,b)=>stronger(a,b)?-1:1);const top=groups[c].slice(0,DEEP_PER_CLUSTER);
          for(const x of top){x.deepEval=evalIndividual(x,deepOpps,deepSeeds,counters);leaders.push(x);}top.sort((a,b)=>stronger(a,b,'deepEval')?-1:1);
        }
        const aggregate=aggregatePopulation(population),clusterSizes=groups.map(x=>x.length),chipCounts=population.map(x=>E.structureHealth(x.program).reachable),deepNonCombat=leaders.reduce((s,x)=>s+(x.deepEval?.nonCombatRate||0),0)/Math.max(1,leaders.length);
        log.push({generation:g+1,clusters:clusterSizes,chipMin:Math.min(...chipCounts),chipMax:Math.max(...chipCounts),coarse:{winRate:aggregate.winRate,resolvedRate:aggregate.resolvedRate,nonCombatRate:aggregate.nonCombatRate,attackGameRate:aggregate.attackGameRate,damageGameRate:aggregate.damageGameRate,fovConditionUseRate:aggregate.fovConditionUseRate,avgAttacks:aggregate.avgAttacks,avgDamage:aggregate.avgDamage},deepLeaderNonCombatRate:deepNonCombat,battles:counters.battles});
        phaseProgress.style.width=(((g+1)/GENERATIONS)*100).toFixed(1)+'%';phaseSummary.textContent=`世代 ${g+1}/${GENERATIONS} / 対戦 ${counters.battles} / 非戦闘 ${pct(aggregate.nonCombatRate)} / 攻撃発生 ${pct(aggregate.attackGameRate)} / 与ダメ発生 ${pct(aggregate.damageGameRate)} / 決着 ${pct(aggregate.resolvedRate)}`;
        if(g===GENERATIONS-1)break;
        const next=[];
        for(let c=0;c<K;c++){
          const pool=groups[c].slice().sort((a,b)=>stronger(a,b)?-1:1),elites=pool.slice(0,ELITES_PER_CLUSTER);
          for(const e of elites){const before=e.hash,cp=makeIndividual(e.program,e.weapons,'eliteCopy',[e.id],g+1);cp.cluster=c;if(cp.hash!==before)counters.eliteHashViolations++;next.push(cp);}
          while(next.filter(x=>x.cluster===c).length<PER_CLUSTER){
            const pa=tournament(pool,rng);let child;
            if(rng()<CROSSOVER_SHARE){const donorPool=rng()<.7?pool:population,pb=tournament(donorPool,rng);child=crossGenome(pa,pb,rng,g+1);counters.crossoverChildren++;}
            else{child=mutateGenome(pa,rng,g+1);counters.mutationChildren++;}
            const h=E.structureHealth(child.program);if(!h.valid){counters.parentCopies++;child=makeIndividual(pa.program,pa.weapons,'parentCopy',[pa.id],g+1);}
            child.cluster=c;next.push(child);
          }
          const best=pool[0];if(best&&!hof.some(h=>h.hash===best.hash&&h.weapons.join('|')===best.weapons.join('|')))hof.push(snapshot(best));
        }
        if(hof.length>72)hof=hof.slice(-72);population=next;
        await new Promise(r=>setTimeout(r,0));
      }
      const finalGroups=groupByCluster(population),finalAgg=aggregatePopulation(population),bestByCluster=finalGroups.map(g=>g.slice().sort((a,b)=>stronger(a,b)?-1:1)[0]).filter(Boolean);
      const report={version:VERSION,structuralVersion:E.VERSION,catalogVersion:window.__chipCatalog?.version||null,simulator:'authoritative-measured-v2',population:POP,clusters:K,generations:GENERATIONS,config:{cpuLimit:cpuChipLimit(),cpuDecisionMs:Math.round(cpuDecisionPeriod()*1000),chassis:phaseChassisSel.value,coarseOpponents:COARSE_OPPS,deepOpponents:DEEP_OPPS,deepPerCluster:DEEP_PER_CLUSTER,elitesPerCluster:ELITES_PER_CLUSTER,mutationShare:MUTATION_SHARE,crossoverShare:CROSSOVER_SHARE,disabledOperators:E.cfg.disabledOperators.slice()},counters:{...counters},finalClusters:finalGroups.map(x=>x.length),finalEngagement:{winRate:finalAgg.winRate,resolvedRate:finalAgg.resolvedRate,nonCombatRate:finalAgg.nonCombatRate,attackGameRate:finalAgg.attackGameRate,damageGameRate:finalAgg.damageGameRate,fovConditionUseRate:finalAgg.fovConditionUseRate,avgAttacks:finalAgg.avgAttacks,avgDamage:finalAgg.avgDamage},bestByCluster:bestByCluster.map(x=>({cluster:x.cluster,id:x.id,hash:x.hash,weapons:x.weapons,reachable:E.structureHealth(x.program).reachable,coarse:{wins:x.eval.wins,draws:x.eval.draws,losses:x.eval.losses,winRate:x.eval.winRate,nonCombatRate:x.eval.nonCombatRate,avgDamage:x.eval.avgDamage,avgAttacks:x.eval.avgAttacks}})),log,timestamp:new Date().toISOString()};
      report.pass=simulateBattleWeaponAware.__authoritativeMeasured===true&&counters.invalidToEvaluation===0&&counters.runtimeHashViolations===0&&counters.programHashViolations===0&&counters.eliteHashViolations===0&&counters.mutationChildren>0&&counters.crossoverChildren>0&&report.finalClusters.every(x=>x===PER_CLUSTER);
      window.__phaseDReport=report;phaseReport.textContent=JSON.stringify(report,null,2);phaseStatus.textContent=report.pass?'Phase D PASS：300個体・6クラスタ・20世代をauthoritative実戦評価器で完走しました。':'Phase D 要確認：監査違反があります。詳細レポートを確認してください。';
      phaseSummary.textContent+=` / ${report.pass?'PASS':'要確認'} / runtime hash違反 ${counters.runtimeHashViolations} / invalid→evaluation ${counters.invalidToEvaluation}`;
      return report;
    } finally {chassisBySide.A=originalChassis.A;chassisBySide.B=originalChassis.B;}
  }

  setTimeout(()=>{
    phaseRunBtn.addEventListener('click',async()=>{phaseRunBtn.disabled=true;phaseReport.textContent='実行中…';phaseProgress.style.width='0%';try{await run();}catch(err){console.error(err);phaseStatus.textContent='Phase D エラー：'+(err?.message||err);phaseReport.textContent=String(err?.stack||err);}finally{phaseRunBtn.disabled=false;}});
    phaseStatus.textContent=`準備完了：${simulateBattleWeaponAware?.__authoritativeMeasured?'authoritative-measured-v2':'評価器未確認'} / ${evo()?.VERSION||'構造エンジン未確認'}`;
  },20);
  window.__phaseD={VERSION,run};
})();