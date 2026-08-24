// Production optimizer integration: validated grid-native D4 pipeline.
// Keeps the old advanced optimizer helpers/persistence, but replaces optimizeHybrid at runtime.
// Structural evolution and the D4 engine are loaded lazily on first search so the stable battle core stays untouched.
const __PRODUCTION_OPTIMIZER_VERSION='grid-native-d4-production-v1';

async function __loadOptimizerModule(path,ready){
  if(ready())return;
  const src=await fetch(path+'?v=20260824-prod-d4-01',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(path+' '+r.status);return r.text();});
  (0,eval)(src);
  if(!ready())throw new Error(path+' initialization failed');
}

function __prodMasterSeed(){
  try{const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]>>>0;}catch(_){return Date.now()>>>0;}
}

optimizeHybrid=async function(maxGenerations=20){
  running=false;startBtn.textContent='戦闘開始';optimizeBtn.disabled=true;
  const requested=Math.max(20,Math.floor(Number(maxGenerations)||20));
  const testedGenerations=20;
  if(typeof maxGenInput!=='undefined'&&maxGenInput){maxGenInput.value=String(testedGenerations);maxGenInput.disabled=true;maxGenInput.title='現在の本番探索はD5で再現性確認済みの20世代構成です';}
  statusEl.textContent='検証済みD4探索を準備中…';
  evoGen.textContent='準備中';evoBattles.textContent='0';evoBest.textContent='-';evoProgress.style.width='1%';
  evoDetail.textContent=requested!==testedGenerations?'安全のため、D5で検証済みの20世代構成で実行します。':'構造制約 → Engagement制約 → Strength → Validation checkpoint の順で探索します。';
  await new Promise(r=>requestAnimationFrame(()=>r()));

  try{
    await __loadOptimizerModule('./chip-catalog.js',()=>window.__chipCatalog?.version==='chip-catalog-v0.1');
    await __loadOptimizerModule('./structural-evolution.js',()=>window.__structuralEvolution?.VERSION==='grid-native-structure-v0.4-metadata');
    if(!simulateBattleWeaponAware?.__authoritativeMeasured)throw new Error('authoritative-measured-v2 simulator is not active');

    const phaseStatus={
      set textContent(v){statusEl.textContent=v;},
      get textContent(){return statusEl.textContent;}
    };
    const phaseSummary={
      set textContent(v){evoDetail.textContent=v;},
      get textContent(){return evoDetail.textContent;}
    };
    const phaseProgress={style:evoProgress.style};
    const phaseReport={textContent:''};
    const phaseChassisSel={get value(){return chassisBySide?.A||'standard';}};
    const seed=__prodMasterSeed();
    let src=await fetch('./phase-d4-evolution.js?v=20260824-prod-d4-01',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('phase-d4-evolution.js '+r.status);return r.text();});
    if(!src.includes("phase-d4-checkpoint-test-v0.1")||!src.includes('const r=rngFactory(26082407),bs=baselines();'))throw new Error('D4 engine source mismatch');
    src=src.replace("const VERSION='phase-d4-checkpoint-test-v0.1';",`const VERSION='${__PRODUCTION_OPTIMIZER_VERSION}-seed-${seed}';`).replace('const r=rngFactory(26082407),bs=baselines();',`const r=rngFactory(${seed}),bs=baselines();`);
    window.__phaseD4=null;
    eval(src);
    if(!window.__phaseD4)throw new Error('D4 production engine install failed');

    const report=await window.__phaseD4.run();
    if(!report?.pass)throw new Error('D4 audit failed');
    const snap=report.selectedCheckpoint?.champion?.snapshot;
    const val=report.selectedCheckpoint?.champion?.metrics;
    const test=report.finalTest?.metrics;
    if(!snap?.program||!Array.isArray(snap.weapons)||snap.weapons.length<2)throw new Error('selected checkpoint is incomplete');

    programs.A=cloneProgram(snap.program);
    weaponA1Sel.value=snap.weapons[0];
    weaponA2Sel.value=snap.weapons[1];
    editSide='A';selectedCell=1;
    state.A={pc:0,acc:0,flag:false,timer:0,lastSeen:0,lastHp:100,hitRecent:0,lockTime:0};
    renderProgram();

    evoGen.textContent=`20 / 20 (選択 ${report.selectedCheckpoint.generation})`;
    evoBattles.textContent=String(report.counters?.battles||0);
    evoBest.textContent=((val?.winRate||0)*100).toFixed(1)+'%';
    evoProgress.style.width='100%';
    evoDetail.textContent=`完了：Validation ${(100*(val?.winRate||0)).toFixed(1)}% / 完全未使用Test ${(100*(test?.winRate||0)).toFixed(1)}% / 平均Damage ${(test?.avgDamage||0).toFixed(2)} / ${snap.weapons.join(' + ')} / seed ${seed}`;
    statusEl.textContent='強さ優先探索完了。検証済みD4方式で選んだcheckpointを自機へ適用しました。';

    const meta={optimizer:__PRODUCTION_OPTIMIZER_VERSION,masterSeed:seed,selectedGeneration:report.selectedCheckpoint.generation,validationWinRate:val?.winRate||0,testWinRate:test?.winRate||0,testAvgDamage:test?.avgDamage||0,checkpointHash:snap.hash,weapons:snap.weapons.slice(),audit:{invalidToEvaluation:report.counters?.invalidToEvaluation, runtimeHashViolations:report.counters?.runtimeHashViolations, programHashViolations:report.counters?.programHashViolations, eliteHashViolations:report.counters?.eliteHashViolations, checkpointHashViolations:report.counters?.checkpointHashViolations, testEvaluations:report.counters?.testEvaluations}};
    if(typeof saveOptimizedResult==='function')saveOptimizedResult(meta);
    window.__lastProductionD4Report=report;
    return report;
  }catch(err){
    console.error(err);
    statusEl.textContent='探索エラー：'+(err?.message||err);
    evoDetail.textContent='本番AIは変更していません。エラー内容を確認してください。';
    throw err;
  }finally{
    optimizeBtn.disabled=false;
  }
};

(function __installProductionD4Ui(){
  try{
    if(typeof maxGenInput!=='undefined'&&maxGenInput){maxGenInput.value='20';maxGenInput.min='20';maxGenInput.max='20';maxGenInput.disabled=true;maxGenInput.title='D5で再現性確認済みの20世代構成';}
    if(typeof optimizeBtn!=='undefined'&&optimizeBtn){optimizeBtn.textContent='強さ優先探索';optimizeBtn.title='D4/D5で検証済み：300個体・6クラスタ・20世代';}
  }catch(e){console.warn('production D4 UI setup failed',e);}
})();