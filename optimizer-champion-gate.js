// Production optimizer integration: grid-native D4 pipeline generalized to the current game setup.
// The D5-verified algorithm/baseline definition is kept, while CPU and chassis come from the UI.
const __PRODUCTION_OPTIMIZER_VERSION='grid-native-d4-production-v5-current-config';

async function __loadOptimizerModule(path,ready){
  if(ready())return;
  const src=await fetch(path+'?v=20260824-prod-current-01',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(path+' '+r.status);return r.text();});
  (0,eval)(src);
  if(!ready())throw new Error(path+' initialization failed');
}

function __chooseProductionMasterSeed(ref){
  const pool=Array.isArray(ref?.VALIDATED_MASTER_SEEDS)&&ref.VALIDATED_MASTER_SEEDS.length?ref.VALIDATED_MASTER_SEEDS:ref?.MASTER_SEEDS?.slice(0,3);
  if(!pool?.length)throw new Error('D5 master-seed pool is empty');
  let i=0;
  try{const a=new Uint32Array(1);crypto.getRandomValues(a);i=a[0]%pool.length;}catch(_){i=Math.floor(Math.random()*pool.length);}
  return Number(pool[i])>>>0;
}

function __productionConfigSnapshot(){
  const cpu=(typeof cpuClass!=='undefined'&&CPU_CLASSES?.[cpuClass])?cpuClass:'standard';
  const ca=(typeof chassisBySide!=='undefined'&&CHASSIS_TYPES?.[chassisBySide.A])?chassisBySide.A:'standard';
  const cb=(typeof chassisBySide!=='undefined'&&CHASSIS_TYPES?.[chassisBySide.B])?chassisBySide.B:'standard';
  return{cpuClass:cpu,cpuLimit:typeof cpuChipLimit==='function'?cpuChipLimit():18,cpuDecisionMs:typeof cpuDecisionMs==='function'?cpuDecisionMs():120,chassisA:ca,chassisB:cb};
}

// D4 was originally symmetric in chassis. For production, preserve the selected A/B chassis.
// The reverse-side evaluation temporarily swaps chassis too, so the candidate keeps the A chassis
// and the opponent keeps the B chassis even when spawn/program sides are reversed for fairness.
function __patchD4ForCurrentChassis(src,chassisA,chassisB){
  const chassisMarker="const oldCh={A:chassisBySide.A,B:chassisBySide.B};chassisBySide.A=phaseChassisSel.value;chassisBySide.B=phaseChassisSel.value;";
  const chassisReplacement=`const oldCh={A:chassisBySide.A,B:chassisBySide.B};chassisBySide.A=${JSON.stringify(chassisA)};chassisBySide.B=${JSON.stringify(chassisB)};`;
  if(!src.includes(chassisMarker))throw new Error('D4 chassis marker mismatch');
  src=src.replace(chassisMarker,chassisReplacement);

  const evalMarker="function evaluate(x,opps,seeds,c){const before=hash(x.program);if(!structureOK(x,c))return{...finish(empty()),invalid:true};const m=empty();for(let i=0;i<opps.length;i++){const q=opps[i],seed=seeds[i%seeds.length],r1=simulateBattleWeaponAware(x.program,q.program,seed,x.weapons[0],x.weapons[1],q.weapons[0],q.weapons[1]),r2=simulateBattleWeaponAware(q.program,x.program,seed,q.weapons[0],q.weapons[1],x.weapons[0],x.weapons[1]);c.battles+=2;add(m,r1,'A');add(m,r2,'B');}if(hash(x.program)!==before)c.programHashViolations++;return finish(m);}";
  const evalReplacement="function evaluate(x,opps,seeds,c){const before=hash(x.program);if(!structureOK(x,c))return{...finish(empty()),invalid:true};const m=empty();for(let i=0;i<opps.length;i++){const q=opps[i],seed=seeds[i%seeds.length],r1=simulateBattleWeaponAware(x.program,q.program,seed,x.weapons[0],x.weapons[1],q.weapons[0],q.weapons[1]);const ca=chassisBySide.A,cb=chassisBySide.B;let r2;chassisBySide.A=cb;chassisBySide.B=ca;try{r2=simulateBattleWeaponAware(q.program,x.program,seed,q.weapons[0],q.weapons[1],x.weapons[0],x.weapons[1]);}finally{chassisBySide.A=ca;chassisBySide.B=cb;}c.battles+=2;add(m,r1,'A');add(m,r2,'B');}if(hash(x.program)!==before)c.programHashViolations++;return finish(m);}";
  if(!src.includes(evalMarker))throw new Error('D4 evaluation marker mismatch');
  return src.replace(evalMarker,evalReplacement);
}

optimizeHybrid=async function(maxGenerations=20){
  running=false;startBtn.textContent='戦闘開始';optimizeBtn.disabled=true;
  const requested=Math.max(20,Math.floor(Number(maxGenerations)||20)),generations=20;
  const config=__productionConfigSnapshot();
  if(typeof maxGenInput!=='undefined'&&maxGenInput){maxGenInput.value=String(generations);maxGenInput.disabled=true;maxGenInput.title='現在の本番探索は20世代で実行します';}
  const cpuName=CPU_CLASSES?.[config.cpuClass]?.name||config.cpuClass;
  const chAName=CHASSIS_TYPES?.[config.chassisA]?.name||config.chassisA;
  const chBName=CHASSIS_TYPES?.[config.chassisB]?.name||config.chassisB;
  statusEl.textContent=`現在設定（${cpuName} / 自機${chAName} / 敵機${chBName}）で強さ優先探索を準備中…`;
  evoGen.textContent='準備中';evoBattles.textContent='0';evoBest.textContent='-';evoProgress.style.width='1%';
  evoDetail.textContent=requested!==generations?`探索アルゴリズムは20世代で実行します。CPU ${cpuName} ${config.cpuLimit}チップ ${config.cpuDecisionMs}ms / ${chAName} vs ${chBName}`:`CPU ${cpuName} ${config.cpuLimit}チップ ${config.cpuDecisionMs}ms / ${chAName} vs ${chBName}`;
  await new Promise(r=>requestAnimationFrame(()=>r()));

  try{
    await __loadOptimizerModule('./chip-catalog.js',()=>window.__chipCatalog?.version==='chip-catalog-v0.1');
    await __loadOptimizerModule('./structural-evolution.js',()=>window.__structuralEvolution?.VERSION==='grid-native-structure-v0.4-metadata');
    await __loadOptimizerModule('./d5-reference-config.js',()=>/^d5-reference-config-v0\.[12]$/.test(window.__D5ReferenceConfig?.VERSION||''));
    if(!simulateBattleWeaponAware?.__authoritativeMeasured)throw new Error('authoritative-measured-v2 simulator is not active');
    if(typeof cpuChipLimit!=='function'||cpuChipLimit()!==config.cpuLimit||typeof cpuDecisionMs!=='function'||cpuDecisionMs()!==config.cpuDecisionMs)throw new Error('CPU setting changed during search setup');
    if(chassisBySide?.A!==config.chassisA||chassisBySide?.B!==config.chassisB)throw new Error('chassis setting changed during search setup');

    const ref=window.__D5ReferenceConfig;
    const phaseStatus={set textContent(v){statusEl.textContent=v;},get textContent(){return statusEl.textContent;}};
    const phaseSummary={set textContent(v){evoDetail.textContent=v;},get textContent(){return evoDetail.textContent;}};
    const phaseProgress={style:evoProgress.style};
    const phaseReport={textContent:''};
    // Kept only because D4's report/UI references this selector. Actual A/B assignment is patched below.
    const phaseChassisSel={get value(){return config.chassisA;}};
    const seed=__chooseProductionMasterSeed(ref);
    let src=await fetch('./phase-d4-evolution.js?v=20260824-prod-current-01',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('phase-d4-evolution.js '+r.status);return r.text();});
    src=ref.patchD4Source(src,seed,`${__PRODUCTION_OPTIMIZER_VERSION}-seed-${seed}`);
    src=__patchD4ForCurrentChassis(src,config.chassisA,config.chassisB);
    window.__phaseD4=null;
    eval(src);
    if(!window.__phaseD4)throw new Error('D4 production engine install failed');

    const report=await window.__phaseD4.run();
    if(!report?.pass)throw new Error('D4 audit failed');
    const snap=report.selectedCheckpoint?.champion?.snapshot,val=report.selectedCheckpoint?.champion?.metrics,test=report.finalTest?.metrics;
    if(!snap?.program||!Array.isArray(snap.weapons)||snap.weapons.length<2)throw new Error('selected checkpoint is incomplete');

    programs.A=cloneProgram(snap.program);
    weaponA1Sel.value=snap.weapons[0];weaponA2Sel.value=snap.weapons[1];
    editSide='A';selectedCell=1;
    if(typeof resetWorld==='function')resetWorld();
    renderProgram();

    evoGen.textContent=`20 / 20 (選択 ${report.selectedCheckpoint.generation})`;
    evoBattles.textContent=String(report.counters?.battles||0);
    evoBest.textContent=((val?.winRate||0)*100).toFixed(1)+'%';evoProgress.style.width='100%';
    evoDetail.textContent=`完了：Validation ${(100*(val?.winRate||0)).toFixed(1)}% / Test ${(100*(test?.winRate||0)).toFixed(1)}% / Damage ${(test?.avgDamage||0).toFixed(2)} / ${snap.weapons.join(' + ')} / checkpoint ${snap.hash} / seed ${seed} / CPU ${cpuName} ${config.cpuLimit}チップ ${config.cpuDecisionMs}ms / ${chAName} vs ${chBName}`;
    statusEl.textContent='強さ優先探索完了。現在選択中のCPU・自機・敵機条件で選んだcheckpointを自機へ適用しました。';

    const meta={optimizer:__PRODUCTION_OPTIMIZER_VERSION,referenceConfigVersion:ref.VERSION,masterSeed:seed,masterSeedPool:(ref.VALIDATED_MASTER_SEEDS||ref.MASTER_SEEDS||[]).slice(0,3),searchConfig:{...config,generations},selectedGeneration:report.selectedCheckpoint.generation,validationWinRate:val?.winRate||0,testWinRate:test?.winRate||0,testAvgDamage:test?.avgDamage||0,checkpointHash:snap.hash,weapons:snap.weapons.slice(),audit:{invalidToEvaluation:report.counters?.invalidToEvaluation,runtimeHashViolations:report.counters?.runtimeHashViolations,programHashViolations:report.counters?.programHashViolations,eliteHashViolations:report.counters?.eliteHashViolations,checkpointHashViolations:report.counters?.checkpointHashViolations,testEvaluations:report.counters?.testEvaluations}};
    if(typeof saveOptimizedResult==='function')saveOptimizedResult(meta);
    window.__lastProductionD4Report=report;
    return report;
  }catch(err){
    console.error(err);statusEl.textContent='探索エラー：'+(err?.message||err);evoDetail.textContent='探索エラー：'+(err?.message||err)+' / 本番AIは変更していません。';throw err;
  }finally{optimizeBtn.disabled=false;}
};

(function __installProductionD4Ui(){
  try{
    if(typeof maxGenInput!=='undefined'&&maxGenInput){maxGenInput.value='20';maxGenInput.min='20';maxGenInput.max='20';maxGenInput.disabled=true;maxGenInput.title='現在設定で20世代探索';}
    if(typeof optimizeBtn!=='undefined'&&optimizeBtn){optimizeBtn.textContent='強さ優先探索';optimizeBtn.title='現在選択中のCPU・自機・敵機条件で探索';}
  }catch(e){console.warn('production D4 UI setup failed',e);}
})();
