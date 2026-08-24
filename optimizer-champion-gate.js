// Production optimizer integration: validated grid-native D4 pipeline.
// Keeps the old advanced optimizer helpers/persistence, but replaces optimizeHybrid at runtime.
// Reference-verification mode intentionally pins the exact D5 configuration and master seed.
const __PRODUCTION_OPTIMIZER_VERSION='grid-native-d4-production-v3-reference';

async function __loadOptimizerModule(path,ready){
  if(ready())return;
  const src=await fetch(path+'?v=20260824-prod-d5ref-01',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(path+' '+r.status);return r.text();});
  (0,eval)(src);
  if(!ready())throw new Error(path+' initialization failed');
}

function __applyValidatedProductionConfig(){
  if(typeof cpuClass!=='undefined')cpuClass='standard';
  if(typeof cpuClassSel!=='undefined'&&cpuClassSel)cpuClassSel.value='standard';
  try{localStorage.setItem('robot-ai-battle-v1-cpu-class','standard');}catch(_e){}
  if(typeof chassisBySide!=='undefined'){
    chassisBySide.A='standard';
    chassisBySide.B='standard';
  }
  if(typeof chassisASel!=='undefined'&&chassisASel)chassisASel.value='standard';
  if(typeof chassisBSel!=='undefined'&&chassisBSel)chassisBSel.value='standard';
  if(typeof saveChassisSelection==='function')saveChassisSelection();
  if(typeof updateChassisInfo==='function')updateChassisInfo();
  if(typeof updateCpuUsage==='function')updateCpuUsage();
  if(typeof resetWorld==='function')resetWorld();
}

optimizeHybrid=async function(maxGenerations=20){
  running=false;startBtn.textContent='戦闘開始';optimizeBtn.disabled=true;
  const requested=Math.max(20,Math.floor(Number(maxGenerations)||20));
  const testedGenerations=20;
  __applyValidatedProductionConfig();
  if(typeof maxGenInput!=='undefined'&&maxGenInput){maxGenInput.value=String(testedGenerations);maxGenInput.disabled=true;maxGenInput.title='D5参照条件の固定seed再現確認中です';}
  statusEl.textContent='D5参照条件を固定して再現確認を準備中…';
  evoGen.textContent='準備中';evoBattles.textContent='0';evoBest.textContent='-';evoProgress.style.width='1%';
  evoDetail.textContent=requested!==testedGenerations?'D5参照条件に合わせ、20世代・Standard 18 / 標準型で実行します。':'D5共通定義：Standard 18 / 120ms・標準型×標準型・固定master seed。';
  await new Promise(r=>requestAnimationFrame(()=>r()));

  try{
    await __loadOptimizerModule('./chip-catalog.js',()=>window.__chipCatalog?.version==='chip-catalog-v0.1');
    await __loadOptimizerModule('./structural-evolution.js',()=>window.__structuralEvolution?.VERSION==='grid-native-structure-v0.4-metadata');
    await __loadOptimizerModule('./d5-reference-config.js',()=>window.__D5ReferenceConfig?.VERSION==='d5-reference-config-v0.1');
    const ref=window.__D5ReferenceConfig;
    if(typeof cpuChipLimit!=='function'||cpuChipLimit()!==ref.VALIDATED.cpuLimit)throw new Error('validated CPU configuration is not active');
    if(typeof cpuDecisionPeriod!=='function'||Math.abs(cpuDecisionPeriod()-ref.VALIDATED.cpuDecisionMs/1000)>1e-9)throw new Error('validated CPU timing is not active');
    if(chassisBySide?.A!==ref.VALIDATED.chassisA||chassisBySide?.B!==ref.VALIDATED.chassisB)throw new Error('validated chassis configuration is not active');
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
    const phaseChassisSel={get value(){return ref.VALIDATED.chassisA;}};
    const seed=ref.defaultMasterSeed;
    let src=await fetch('./phase-d4-evolution.js?v=20260824-prod-d5ref-01',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('phase-d4-evolution.js '+r.status);return r.text();});
    src=ref.patchD4Source(src,seed,`${__PRODUCTION_OPTIMIZER_VERSION}-seed-${seed}`);
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
    evoDetail.textContent=`D5参照再現：Validation ${(100*(val?.winRate||0)).toFixed(1)}% / Test ${(100*(test?.winRate||0)).toFixed(1)}% / Damage ${(test?.avgDamage||0).toFixed(2)} / ${snap.weapons.join(' + ')} / checkpoint ${snap.hash} / seed ${seed} / CPU Standard 18・標準型×標準型`;
    statusEl.textContent='D5参照固定seedの探索が完了しました。checkpoint hashをD5参照試験と照合できます。';

    const meta={optimizer:__PRODUCTION_OPTIMIZER_VERSION,referenceConfigVersion:ref.VERSION,masterSeed:seed,validatedConfig:{...ref.VALIDATED},selectedGeneration:report.selectedCheckpoint.generation,validationWinRate:val?.winRate||0,testWinRate:test?.winRate||0,testAvgDamage:test?.avgDamage||0,checkpointHash:snap.hash,weapons:snap.weapons.slice(),audit:{invalidToEvaluation:report.counters?.invalidToEvaluation,runtimeHashViolations:report.counters?.runtimeHashViolations,programHashViolations:report.counters?.programHashViolations,eliteHashViolations:report.counters?.eliteHashViolations,checkpointHashViolations:report.counters?.checkpointHashViolations,testEvaluations:report.counters?.testEvaluations}};
    if(typeof saveOptimizedResult==='function')saveOptimizedResult(meta);
    window.__lastProductionD4Report=report;
    return report;
  }catch(err){
    console.error(err);
    statusEl.textContent='探索エラー：'+(err?.message||err);
    evoDetail.textContent='探索エラー：'+(err?.message||err)+' / 本番AIは変更していません。';
    throw err;
  }finally{
    optimizeBtn.disabled=false;
  }
};

(function __installProductionD4Ui(){
  try{
    if(typeof maxGenInput!=='undefined'&&maxGenInput){maxGenInput.value='20';maxGenInput.min='20';maxGenInput.max='20';maxGenInput.disabled=true;maxGenInput.title='D5参照固定seed再現モード';}
    if(typeof optimizeBtn!=='undefined'&&optimizeBtn){optimizeBtn.textContent='強さ優先探索';optimizeBtn.title='D5共通定義・固定seed 26082407で再現確認';}
  }catch(e){console.warn('production D4 UI setup failed',e);}
})();
